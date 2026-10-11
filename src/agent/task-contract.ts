export function validateTaskRequest(args:Record<string,unknown>) {
 if(!['list','pause','resume','cancel','remove','clear'].includes(String(args.action)))throw Error('任务操作应为 list/pause/resume/cancel/remove/clear');
 for(const key of Object.keys(args))if(!['action','expectedRevision',...(args.action==='remove'?['id']:[])].includes(key))throw Error('未知任务参数：'+key);
 if(args.action==='remove'&&(typeof args.id!=='string'||!args.id||args.id.length>200))throw Error('请从任务列表选择有效 ID');
 if(!['list','cancel'].includes(String(args.action))&&(typeof args.expectedRevision!=='string'||!args.expectedRevision))throw Error('请先读取任务列表，再传入 expectedRevision');
 return args as {action:'list'|'pause'|'resume'|'cancel'|'remove'|'clear';expectedRevision?:string;id?:string};
}
