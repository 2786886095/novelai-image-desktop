export function validateTemplateRequest(args:Record<string,unknown>) {
 const action=args.action;
 if(!['read','select','save','restore'].includes(String(action)))throw Error('模板操作应为 read/select/save/restore');
 const allowed=['action','kind','mode','templateVersion',...(action==='read'?[]:['expectedRevision']),...(action==='save'?['body']:[])];
 if(Object.keys(args).some(k=>!allowed.includes(k)))throw Error('未知模板参数');
 if(args.kind!==undefined&&!['convert','reverse'].includes(String(args.kind)))throw Error('模板用途应为 convert/reverse');
 if(args.mode!==undefined&&!['mixed','natural','tags'].includes(String(args.mode)))throw Error('请选择混合、自然语言或标签模式');
 if(args.templateVersion!==undefined&&!['v5','v4.5'].includes(String(args.templateVersion)))throw Error('模板版本应为 v5/v4.5');
 if(action!=='read'&&(typeof args.expectedRevision!=='string'||!args.expectedRevision||args.expectedRevision.length>128))throw Error('请先读取模板 revision');
 if(action==='save'&&(typeof args.body!=='string'||!args.body.trim()||args.body.length>60000))throw Error('请输入不超过 60000 字的模板；恢复默认请用 restore');
 return {...args} as Record<string,unknown>&{action:'read'|'select'|'save'|'restore'};
}
