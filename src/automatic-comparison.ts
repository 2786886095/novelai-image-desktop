/** Local display preferences: never alter generation parameters or discard the before image. */
export const COMPARISON_SURFACES = ['generate:t2i','generate:i2i','generate:enhance','inpaint','postprocess:upscale','postprocess:director'] as const;
export type ComparisonSurface = typeof COMPARISON_SURFACES[number];
export type AutomaticComparison = Record<ComparisonSurface,boolean>;
export function normalizeAutomaticComparison(value: unknown): AutomaticComparison {
 const raw=value && typeof value==='object' ? value as Record<string,unknown> : {};
 return Object.fromEntries(COMPARISON_SURFACES.map(key=>[key,typeof raw[key]==='boolean'?raw[key]:true])) as AutomaticComparison;
}
export function comparisonText(language:unknown) {
 const labels:Record<string,string[]>={
 'zh-CN':['自动对比','完成后自动打开对比；关闭后仍可手动查看。','角色名称'],
 'zh-TW':['自動對比','完成後自動開啟對比；關閉後仍可手動查看。','角色名稱'],
 'en-US':['Automatic comparison','Open comparison after completion; manual comparison remains available.','Character name'],
 'ja-JP':['自動比較','完了後に比較を開きます。オフでも手動で比較できます。','キャラクター名'],
 'ko-KR':['자동 비교','완료 후 비교를 엽니다. 꺼도 수동 비교가 가능합니다.','캐릭터 이름']};
 const [label,hint,name]=labels[String(language)]??labels['en-US'];return {label,hint,name};
}
