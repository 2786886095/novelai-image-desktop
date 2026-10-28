/** Local display preferences: never alter generation parameters or discard the before image. */
export const COMPARISON_SURFACES = ['generate:t2i','generate:i2i','generate:enhance','inpaint','postprocess:upscale','postprocess:director'] as const;
export type ComparisonSurface = typeof COMPARISON_SURFACES[number];
export type AutomaticComparison = Record<ComparisonSurface,boolean>;
export function automaticComparisonAllowed(surface:unknown){return COMPARISON_SURFACES.includes(surface as ComparisonSurface) && surface!=='generate:t2i';}
export function normalizeAutomaticComparison(value: unknown): AutomaticComparison {
 const raw=value && typeof value==='object' ? value as Record<string,unknown> : {};
 return Object.fromEntries(COMPARISON_SURFACES.map(key=>[key,automaticComparisonAllowed(key) && (typeof raw[key]==='boolean'?raw[key]:true)])) as AutomaticComparison;
}
export function comparisonText(language:unknown) {
 const labels:Record<string,string[]>={
 'zh-CN':['自动对比','完成后自动打开对比；关闭后仍可手动查看。','角色名称']};
 const [label,hint,name]=labels[String(language)]??labels['zh-CN'];return {label,hint,name};
}
