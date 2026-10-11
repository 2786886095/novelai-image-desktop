/** Shared non-secret wire contract. This does not reuse a NovelAI token or retry policy. */
export interface CompatibleImageConfig {
 baseUrl:string; model:string; apiKey:string;
 responseFormat?:'auto'|'b64_json'|'url'; allowInsecureHttp?:boolean;
}
export interface CompatibleImageInput {
 prompt:string; size:string; n:number;
 extensions?:Record<string,unknown>;
}
export function imageGenerationEndpoint(value:string,allowInsecureHttp=false){
 let url:URL;try{url=new URL(value.trim());}catch{throw Error('图片接口地址无效');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.protocol==='http:'&&!local&&!allowInsecureHttp)throw Error('图片接口须使用 HTTPS（本机地址除外），且地址不包含凭据、查询参数或片段');
 url.pathname=url.pathname.replace(/\/+$/,'');
 if(!url.pathname.endsWith('/images/generations'))url.pathname+='/images/generations';
 return url.href;
}
export function buildCompatibleImageRequest(config:Pick<CompatibleImageConfig,'model'|'responseFormat'>,input:CompatibleImageInput){
 if(typeof config.model!=='string'||!config.model.trim()||config.model.length>256)throw Error('请输入图片模型名称');
 if(typeof input.prompt!=='string'||!input.prompt.trim())throw Error('请输入图片提示词');
 if(typeof input.size!=='string'||!(input.size==='auto'||/^[1-9]\d{0,4}x[1-9]\d{0,4}$/.test(input.size)))throw Error('尺寸应为 WIDTHxHEIGHT 或 auto');
 if(!Number.isSafeInteger(input.n)||input.n<1)throw Error('图片张数须为正整数');
 const body:Record<string,unknown>={model:config.model.trim(),prompt:input.prompt,size:input.size,n:input.n};
 if(config.responseFormat&&config.responseFormat!=='auto'){
  if(!['b64_json','url'].includes(config.responseFormat))throw Error('返回格式无效');
  body.response_format=config.responseFormat;
 }
 for(const [key,value] of Object.entries(input.extensions??{})){
  if(key==='negative_prompt'||key==='sampler'){if(typeof value!=='string')throw Error('扩展参数类型无效');}
  else if(['steps','scale','seed'].includes(key)){if(typeof value!=='number'||!Number.isFinite(value))throw Error('扩展参数数值无效');if(key!=='scale'&&!Number.isSafeInteger(value))throw Error('扩展参数须为整数');}
  else throw Error('未支持的网关扩展字段');
  body[key]=value;
 }
 return body;
}
export type CompatibleFailurePhase='configuration'|'generate'|'download'|'decode';
/** Never format raw HTTP exceptions: they can contain Authorization and request bodies. */
export function compatibleImageError(phase:CompatibleFailurePhase,status?:number){
 const reason=status===401?'认证失败':status===403?'访问被拒绝':status===404?'接口或模型不存在':status===429?'限流或配额不足':status&&status>=500?'上游服务异常':status&&status>=300&&status<400?'接口重定向已停止':status?'上游拒绝请求':phase==='configuration'?'配置无效，请检查接口、模型、尺寸和密钥':phase==='download'?'生成结果的图片下载未完成':phase==='decode'?'图片数据无效、超出处理大小或返回张数不符':'连接中断、超时或生成响应无效';
 return {phase,...(status?{status}:{}),message:`图片接口${status?` HTTP ${status}`:''}：${reason}。未自动重新提交生成请求，请先核对服务端记录。`};
}
