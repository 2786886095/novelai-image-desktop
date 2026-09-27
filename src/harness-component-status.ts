import type {HarnessSnapshot} from './harness-types';
export function componentStatus(state:HarnessSnapshot):{key:string;params?:Record<string,string>} {
  if(state.checkingUpdates)return {key:'检查中…'};
  const info=state.updateInfo;
  if(!info)return {key:'尚未检查'};
  if(info.bundledUpdate&&info.bundledComponent)return {key:'本机随附更新：{version}（待兼容检查）',params:{version:info.bundledComponent}};
  if(info.component&&!info.componentFailed)return {key:'最新已发布组件：{version}',params:{version:info.component}};
  if(info.bundledComponent===state.version&&state.version)return {key:'本机随附组件已安装：{version}',params:{version:state.version}};
  return {key:info.componentFailed?'检查失败，请重试':'暂无已发布组件'};
}
