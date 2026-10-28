import {builtinFont} from './builtin-fonts';
export type UiTypography = { font: string; scale: number };
export type UiFont = { id: string; name: string };
export const DEFAULT_TYPOGRAPHY: UiTypography = {font:'default',scale:100};
export const FONT_LIMIT = 16;
export const FONT_MAX_BYTES = 20 * 1024 * 1024;
export const isImportedFont = (id: unknown): id is string => typeof id==='string' && /^font-[a-f0-9]{64}$/.test(id);
export function normalizeTypography(raw: unknown): UiTypography {
  const v = raw && typeof raw==='object' ? raw as Partial<UiTypography> : {};
  const n = typeof v.scale==='number' && Number.isFinite(v.scale) ? v.scale : 100;
  return {font: (['default','sans','serif','mono'].includes(String(v.font))||!!builtinFont(String(v.font))) || isImportedFont(v.font) ? String(v.font) : 'default', scale:Math.round(Math.min(200,Math.max(80,n)))};
}
export function fontFamily(id: string): string {
  if (id==='default') return '';
  const fallback = '"Noto Sans SC", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif';
  if (isImportedFont(id)||builtinFont(id)) return `"Studio-${id}", ${fallback}`;
  if (id==='serif') return '"Noto Serif CJK SC", "Songti SC", SimSun, serif';
  if (id==='mono') return `Consolas, "SFMono-Regular", monospace, ${fallback}`;
  return fallback;
}
/** Bounded SFNT validation before passing untrusted font bytes to the font engine. */
export function validateFont(bytes: Uint8Array): void {
  if(bytes.length<12 || bytes.length>FONT_MAX_BYTES) throw Error('FONT_SIZE');
  const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(![0x00010000,0x4f54544f].includes(d.getUint32(0))) throw Error('FONT_FORMAT');
  const count=d.getUint16(4);
  if(count<1 || count>256 || 12+16*count>bytes.length) throw Error('FONT_TABLES');
  const tags=new Set<string>();
  for(let i=0;i<count;i++) {
    const pos=12+i*16, offset=d.getUint32(pos+8),length=d.getUint32(pos+12);
    if(offset>bytes.length || length>bytes.length-offset) throw Error('FONT_BOUNDS');
    tags.add(String.fromCharCode(...bytes.subarray(pos,pos+4)));
  }
  if(!['cmap','head','name','hhea','hmtx','maxp'].every(t=>tags.has(t)) || !['glyf','CFF ','CFF2'].some(t=>tags.has(t))) throw Error('FONT_TABLES');
}
export function typographyText(_language: unknown) {
  const zh={title:'全局字体与字号',font:'字体',default:'软件默认',sans:'无衬线',serif:'衬线 / 宋体',mono:'等宽',scale:'全局字号缩放',import:'导入字体',remove:'移除当前导入字体',reset:'恢复默认字体与字号',preview:'预览：中文 English 日本語 한국어 0123456789',hint:'适用于软件内所有文字（含提示词、对话和参数）；系统原生窗口遵循系统设置。支持 TTF / OTF，每个最多 20 MiB；字体保存在本机，不修改原字体文件。',failed:'操作失败，原设置保持不变。',missing:'导入字体不可用，暂时使用默认字体；请重新导入。',saved:'已保存',familyHint:'默认与无衬线字形接近属正常；宋体更易看出中文差别。导入字体若不含中文字形，中文会回退到系统字体。'};
  return zh;
}
