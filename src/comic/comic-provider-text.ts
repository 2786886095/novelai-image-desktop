const copy={
 'zh-CN':{title:'兼容图片服务',hint:'漫画使用设置中保存的独立图片接口、模型和扩展参数。统一尺寸读取服务配置；逐格尺寸按分镜选择，须由服务商支持。原生种子、采样器、负面参数和参考图不自动应用；启用的参考图会阻止提交。',fees:'费用以图片服务商记录为准',confirm:'使用 {model}（默认尺寸 {size}，逐格尺寸按分镜）生成 {count} 张图片？本次确认覆盖整批，失败停止后续提交，已保存图片保留。费用以服务商为准。'},
} as const;
export function comicProviderText(language:unknown){return copy[typeof language==='string'&&language in copy?language as keyof typeof copy:'zh-CN'];}
export function compatibleComicConfirmation(language:unknown,values:{model?:string;size?:string;count:number}){return comicProviderText(language).confirm.replace(/\{(model|size|count)\}/g,(_,key:keyof typeof values)=>String(values[key]??'—'));}
