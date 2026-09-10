/** Accept copied API operation URLs as well as base URLs; retain custom proxy prefixes. */
export function normalizeNovelAiEndpoint(value: string, fallback: string): string {
 const candidate=value.trim()||fallback;
 try {
  const url=new URL(candidate);
  url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/(?:ai\/(?:generate-image(?:-stream)?|upscale|augment-image)|user\/(?:data|subscription))$/,'');
  return url.toString().replace(/\/$/,'');
 }catch{return candidate.replace(/\/+$/,'');}
}
