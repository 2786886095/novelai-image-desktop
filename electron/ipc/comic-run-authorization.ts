import type {TagComicGenerateRequest} from '../../src/types';
const permissions=new Map<string,(request:TagComicGenerateRequest)=>Promise<void|(()=>void)>>();
export function registerAgentComicRun(runId:string,authorize:(request:TagComicGenerateRequest)=>Promise<void|(()=>void)>){
 if(!runId.startsWith('agent-comic-')||permissions.has(runId))throw Error('漫画运行授权标识无效或重复');
 permissions.set(runId,authorize);return()=>{if(permissions.get(runId)===authorize)permissions.delete(runId);};
}
export async function authorizeAgentComicRequest(request:TagComicGenerateRequest){
 if(!request.runId?.startsWith('agent-comic-'))return;
 const authorize=permissions.get(request.runId);if(!authorize)throw Error('Agent 漫画运行授权已结束或过期；未提交图片请求');
 return await authorize(request);
}
