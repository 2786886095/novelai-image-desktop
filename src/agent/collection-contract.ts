type Spec={title:string;effect:'read'|'write'|'confirm';fields?:readonly string[];help?:string};
export const collectionActionCatalog:Record<string,Spec>={
 'favorites.local.list':{title:'读取本地原图收藏与保存目录',effect:'read'},
 'favorites.local.add':{title:'收藏已有历史图片（复制原图及元数据）',effect:'write',fields:['id'],help:'id 来自历史图片列表；不会下载在线图片。'},
 'favorites.local.rename':{title:'修改收藏文件的名称后缀',effect:'write',fields:['id','name'],help:'name 只填写末尾名称；空字符串移除后缀，固定前缀不变。'},
 'favorites.local.remove':{title:'移出本地收藏（保留原图及收藏文件）',effect:'confirm',fields:['id']},
 'favorites.local.chooseDirectory':{title:'选择收藏目录并复制已有收藏，保留旧文件',effect:'write'},
 'favorites.local.openDirectory':{title:'打开收藏保存目录',effect:'write'},
 'favorites.local.open':{title:'定位收藏原图',effect:'write',fields:['id']},
 'favorites.view.read':{title:'读取本地收藏浏览布局与每页张数',effect:'read'},
 'favorites.view.update':{title:'设置本地收藏布局与每页张数',effect:'write',fields:['layout','pageSize'],help:'layout 为 grid 或 masonry；pageSize 为 12、24、48 或 96。只修改浏览方式，不修改文件。'},
 'favorites.online.list':{title:'读取在线收藏（与本地原图分开）',effect:'read'},
 'favorites.online.add':{title:'保存在线画廊书签，不下载原图',effect:'write',fields:['item'],help:'item 使用画廊搜索所得元数据：source/id/title/images[{url,thumb}]，可含author/sourceUrl/prompt/negativePrompt/createdAt/score；不要伪造链接。'},
 'favorites.online.remove':{title:'移除在线书签（不删除本地图片）',effect:'confirm',fields:['id'],help:'id 使用列表返回的 key（source:id）。'},
 'navigation.read':{title:'读取顶栏功能、顺序和当前页面',effect:'read'},
 'navigation.select':{title:'切换软件页面',effect:'write',fields:['id']},
 'navigation.setOrder':{title:'排列顶栏并保存',effect:'write',fields:['order'],help:'order 必须完整包含 navigation.read 返回的功能ID，每项一次。'},
 'navigation.reset':{title:'恢复顶栏默认顺序',effect:'confirm'},
};
export function collectionGroup(action:string){return action.startsWith('favorites.local.')?'favorites.local':action.startsWith('favorites.online.')?'favorites.online':action.startsWith('favorites.view.')?'favorites.view':'navigation';}
export function validateCollectionAction(args:Record<string,unknown>){
 const action=String(args.action??'');if(!Object.hasOwn(collectionActionCatalog,action))throw Error('未知收藏或导航操作');const spec=collectionActionCatalog[action];
 for(const key of Object.keys(args))if(!['action','expectedRevision','offset','limit',...(spec.fields??[])].includes(key))throw Error('未知操作参数：'+key);
 for(const field of spec.fields??[]){const value=args[field];
  if(field==='order'){if(!Array.isArray(value)||value.length>50||value.some(x=>typeof x!=='string'))throw Error('order 必须为完整功能ID列表');}
  else if(field==='item'){if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>100000)throw Error('item 必须为画廊书签对象（最大100KB）');}
  else if(field==='pageSize'){if(![12,24,48,96].includes(value as number))throw Error('每页张数必须为12、24、48或96');}
  else if(field==='layout'){if(!['grid','masonry'].includes(String(value)))throw Error('布局必须为 grid 或 masonry');}
  else if(typeof value!=='string'||(field!=='name'&&!value.trim())||value.length>(field==='id'?400:200))throw Error('参数无效：'+field);
 }
 for(const [key,max] of [['offset',1000000],['limit',50]] as const)if(args[key]!==undefined&&(!Number.isSafeInteger(args[key])||(args[key] as number)<(key==='limit'?1:0)||(args[key] as number)>max))throw Error('分页参数无效');
 if(spec.effect!=='read'&&(typeof args.expectedRevision!=='string'||!args.expectedRevision))throw Error('请先读取同类资料并传入 expectedRevision');
 return {action,...spec};
}
