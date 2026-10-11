type Spec={title:string;effect:'read'|'write';fields:readonly string[]};
export const batchProjectCatalog:Record<string,Spec>={
 'batch.project.read':{title:'读取软件批量重绘工程、输入图片ID、候选和参数；不是普通生成或漫画队列',effect:'read',fields:[]},
 'batch.project.update':{title:'修改批量全局参数，不生成图片；patch可含groupName/globalStrength/globalStyle/globalNegative/globalParams/candidateCount/sizeMode/sizeBulk',effect:'write',fields:['patch']},
 'batch.items.update':{title:'修改已导入图片的prompt/strength/overrideParams/params/name，不删除候选',effect:'write',fields:['id','patch']},
 'batch.candidates.select':{title:'选择指定图片的已生成候选，不重新生成',effect:'write',fields:['id','candidateId']},
 'batch.generation.start':{title:'执行软件批量重绘：all全部、pending未完成、failed失败、additional各加一张；itemIds空数组表示全部；只在Agent确认整批，回执后读status核实',effect:'write',fields:['mode','itemIds']},
 'batch.generation.status':{title:'读取批量重绘运行进度，不启动生成',effect:'read',fields:[]},
 'batch.generation.stop':{title:'停止指定批量重绘，保留已生成图片，只取消本任务',effect:'write',fields:['runId']},
};
export function validateBatchAction(args:Record<string,unknown>){
 const action=String(args.action??'');if(!Object.hasOwn(batchProjectCatalog,action))throw Error('未知批量重绘操作');const spec=batchProjectCatalog[action];if(JSON.stringify(args).length>250000)throw Error('批量修改过大，请拆分');
 for(const key of Object.keys(args))if(!['action','expectedRevision','offset','limit',...spec.fields].includes(key))throw Error('未知批量参数：'+key);
 for(const key of spec.fields){const v=args[key];if(key==='patch'){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('patch须为对象');}else if(key==='itemIds'){if(!Array.isArray(v)||new Set(v).size!==v.length||v.some(x=>typeof x!=='string'||!x||x.length>200))throw Error('itemIds须为无重复图片ID数组');}else if(key==='mode'){if(!['all','pending','failed','additional'].includes(String(v)))throw Error('批量模式无效');}else if(typeof v!=='string'||!v.trim()||v.length>200)throw Error('批量参数无效：'+key);}
 for(const key of ['offset','limit']){const v=args[key];if(v!==undefined&&(!Number.isSafeInteger(v)||(v as number)<(key==='offset'?0:1)||(v as number)>(key==='offset'?1000000:50)))throw Error('分页参数无效');}
 if(spec.effect!=='read'&&action!=='batch.generation.stop'&&(typeof args.expectedRevision!=='string'||!args.expectedRevision))throw Error('先读取工程，再传expectedRevision');return {action,...spec};
}
