import type {BatchRedrawRequest} from '../../src/types';
const permissions=new Map<string,(request:BatchRedrawRequest)=>Promise<void|(()=>void)>>();
export function registerAgentBatchRun(runId:string,authorize:(request:BatchRedrawRequest)=>Promise<void|(()=>void)>){if(!runId.startsWith('agent-batch-')||permissions.has(runId))throw Error('批量运行授权标识无效或重复');permissions.set(runId,authorize);return()=>{if(permissions.get(runId)===authorize)permissions.delete(runId);};}
export async function authorizeAgentBatchRequest(request:BatchRedrawRequest){if(!request.runId?.startsWith('agent-batch-'))return;const authorize=permissions.get(request.runId);if(!authorize)throw Error('Agent 批量运行授权已结束或过期');return authorize(request);}
