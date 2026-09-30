type Spec={title:string;effect:'read'|'write'|'confirm';fields:readonly string[]};
export const comicProjectCatalog:Record<string,Spec>={
 'comic.generation.start':{title:'按漫画工程生成：mode initial补足、regenerate整批重做、additional各加一张；panelIds空数组表示全部。使用会话授权，不弹软件确认；回执后用status核实',effect:'write',fields:['mode','panelIds']},
 'comic.generation.status':{title:'读取漫画队列进度与最后运行状态，不启动生成',effect:'read',fields:[]},
 'comic.generation.stop':{title:'停止指定漫画队列，保留已生成图片；当前请求结束后停止',effect:'write',fields:['runId']},
 'comic.project.read':{title:'读取当前漫画工程（不是普通生图队列）',effect:'read',fields:[]},
 'comic.project.update':{title:'修改漫画全局设置，不生成图片',effect:'write',fields:['patch']},
 'comic.project.new':{title:'新建漫画工程，备份原工程并保留图片',effect:'confirm',fields:[]},
 'comic.project.import':{title:'导入工程JSON，备份当前工程；不信任外部文件路径',effect:'confirm',fields:['project']},
 'comic.project.export':{title:'导出便携工程JSON，不打包图片或本地路径',effect:'read',fields:[]},
 'comic.panels.append':{title:'追加分镜提示词（每行一格，或JSON/CSV）',effect:'write',fields:['text']},
 'comic.panels.replace':{title:'替换分镜提示词，备份当前工程并保留原图片',effect:'confirm',fields:['text']},
 'comic.panels.update':{title:'修改指定分镜，不清除已有候选图',effect:'write',fields:['id','patch']},
 'comic.panels.reorder':{title:'按完整分镜ID列表重排',effect:'write',fields:['order']},
 'comic.panels.remove':{title:'移除分镜记录，备份工程并保留图片',effect:'confirm',fields:['id']},
 'comic.panels.sizes':{title:'按软件尺寸模板更新逐格尺寸',effect:'write',fields:['text']},
 'comic.candidates.select':{title:'选择该分镜已有候选图，不重新生成',effect:'write',fields:['id','candidateId']},
 'comic.references.import':{title:'从已有参考预设、历史图片或当前会话附件导入漫画参考图',effect:'write',fields:['source','sourceId']},
 'comic.references.update':{title:'修改漫画参考图类型、强度与分镜范围',effect:'write',fields:['id','patch']},
 'comic.references.panel':{title:'设置逐格参考覆盖（含启用/禁用）',effect:'write',fields:['id','referenceId','patch']},
 'comic.references.panel.reset':{title:'清除逐格参考覆盖，恢复全局范围规则',effect:'write',fields:['id','referenceId']},
 'comic.references.remove':{title:'移除漫画参考记录，备份工程且保留原图文件',effect:'confirm',fields:['id']},
 'comic.images.export':{title:'导出当前选中漫画主图ZIP（缺图则停止，不导出残缺包）',effect:'read',fields:[]},

};
export function validateComicAction(args:Record<string,unknown>){
 const action=String(args.action??'');if(!Object.hasOwn(comicProjectCatalog,action))throw Error('未接通的漫画工程操作');const spec=comicProjectCatalog[action];
 if(JSON.stringify(args).length>250000)throw Error('漫画操作输入过大，请拆分');
 for(const key of Object.keys(args))if(!['action','expectedRevision','offset','limit',...spec.fields].includes(key))throw Error('未知漫画操作参数：'+key);
 for(const key of spec.fields){const v=args[key];
  if(key==='patch'||key==='project'){if(!v||typeof v!=='object'||Array.isArray(v))throw Error(key+' 必须为对象');}
  else if(key==='panelIds'){if(!Array.isArray(v)||new Set(v).size!==v.length||v.some(x=>typeof x!=='string'||!x||x.length>200))throw Error('panelIds 必须是无重复分镜ID数组');}
  else if(key==='mode'){if(!['initial','regenerate','additional'].includes(String(v)))throw Error('生成模式无效');}
  else if(key==='order'){if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))throw Error('order 必须为分镜ID数组');}
  else if(typeof v!=='string'||!v.trim()||v.length>(key==='text'?200000:200))throw Error('参数无效：'+key);
 }
 for(const key of ['offset','limit']){const v=args[key];if(v!==undefined&&(!Number.isSafeInteger(v)||(v as number)<(key==='offset'?0:1)||(v as number)>(key==='offset'?1000000:50)))throw Error('分页参数无效');}
 if(action!=='comic.generation.stop'&&(spec.effect!=='read'||action==='comic.images.export')&&(typeof args.expectedRevision!=='string'||!args.expectedRevision))throw Error('先读取漫画工程，再传入 expectedRevision');
 return {action,...spec};
}
