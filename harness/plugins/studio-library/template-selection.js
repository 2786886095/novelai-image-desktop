export function templatePanelReadArgs({kind,mode,version,edition}) {
 if(!['convert','reverse','assistant','optimize'].includes(kind))throw Error('模板用途无效');
 if(mode!=null&&!['mixed','tags','natural'].includes(mode))throw Error('模板模式无效');
 if(version!=null&&!['v5','v4.5'].includes(version))throw Error('生图模型无效');
 if(edition!=null&&!['1.0.0','2.0.0','3.0.0'].includes(edition))throw Error('技能版本无效');
 return {kind,...(mode?{mode}:{}),...(version?{templateVersion:version}:{}),...(version==='v4.5'?{skillVersion:'1.0.0'}:edition?{skillVersion:edition}:{})};
}
export function templatePanelSaveArgs(snapshot,body,reset=false) {
 if(!snapshot||!snapshot.revision)throw Error('请先读取当前版本模板');
 if(!['1.0.0','2.0.0','3.0.0'].includes(snapshot.skillVersion))throw Error('模板版本快照已过期，请重新读取');
 if(snapshot.templateVersion==='v4.5'&&snapshot.skillVersion!=='1.0.0')throw Error('2.0.0 仅适用于 V5 Full');
 return {...templatePanelReadArgs({kind:snapshot.kind,mode:snapshot.mode,version:snapshot.templateVersion,edition:snapshot.skillVersion}),expectedRevision:snapshot.revision,body:reset?'':body,restoreDefault:reset};
}
