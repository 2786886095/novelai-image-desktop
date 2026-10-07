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
export function typographyText(language: unknown) {
  const zh={title:'全局字体与字号',font:'字体',default:'软件默认',sans:'无衬线',serif:'衬线 / 宋体',mono:'等宽',scale:'全局字号缩放',import:'导入字体',remove:'移除当前导入字体',reset:'恢复默认字体与字号',preview:'预览：中文 English 日本語 한국어 0123456789',hint:'适用于软件内所有文字（含提示词、对话和参数）；系统原生窗口遵循系统设置。支持 TTF / OTF，每个最多 20 MiB；字体保存在本机，不修改原字体文件。',failed:'操作失败，原设置保持不变。',missing:'导入字体不可用，暂时使用默认字体；请重新导入。',saved:'已保存',familyHint:'默认与无衬线字形接近属正常；宋体更易看出中文差别。导入字体若不含中文字形，中文会回退到系统字体。'};
  if(language==='zh-TW')return {...zh,title:'全域字型與字級',font:'字型',default:'軟體預設',sans:'無襯線',serif:'襯線 / 宋體',mono:'等寬',scale:'全域字級縮放',import:'匯入字型',remove:'移除目前匯入字型',reset:'恢復預設字型與字級',preview:'預覽：中文 English 日本語 한국어 0123456789',hint:'套用於軟體內所有文字（含提示詞、對話和參數）；系統原生視窗遵循系統設定。支援 TTF / OTF，每個最多 20 MiB；字型儲存在本機，不修改原檔。',failed:'操作失敗，原設定保持不變。',missing:'匯入字型無法使用，暫時使用預設字型；請重新匯入。',saved:'已儲存',familyHint:'預設與無襯線字形相近屬正常；宋體較容易看出中文差別。匯入字型若不含中文字形，中文會回退到系統字型。'};
  const en={title:'Global font and text size',font:'Font',default:'App default',sans:'Sans serif',serif:'Serif',mono:'Monospace',scale:'Global text size',import:'Import font',remove:'Remove active imported font',reset:'Reset font and text size',preview:'Preview: 中文 English 日本語 한국어 0123456789',hint:'All in-app text, including prompts, chat and parameters. Native system windows follow OS settings. TTF / OTF, up to 20 MiB each; stored locally without modifying the original font.',failed:'Operation failed; previous settings retained.',missing:'Imported font unavailable; using the default temporarily. Please reimport it.',saved:'Saved',familyHint:'Default and sans serif can look similar. Serif makes Chinese differences easier to see; missing glyphs in imported fonts use system fallback.'};
  if(language==='ja-JP')return {...en,title:'全体のフォントと文字サイズ',font:'フォント',default:'アプリの既定',sans:'サンセリフ',serif:'セリフ',mono:'等幅',scale:'全体の文字サイズ',import:'フォントを読み込む',remove:'現在のフォントを削除',reset:'既定に戻す',preview:'プレビュー：中文 English 日本語 한국어 0123456789',hint:'プロンプト、会話、パラメーターを含むアプリ内の全テキスト。OS のウィンドウはシステム設定に従います。TTF / OTF、各 20 MiB まで。元のファイルを変更せず本機に保存します。',failed:'操作に失敗しました。元の設定を保持しました。',missing:'フォントを利用できないため既定を使用中です。再読み込みしてください。',saved:'保存しました',familyHint:'既定とサンセリフは似る場合があります。中国語の違いはセリフで確認できます。読み込んだフォントにない文字はシステムフォントに戻ります。'};
  if(language==='ko-KR')return {...en,title:'전체 글꼴 및 글자 크기',font:'글꼴',default:'앱 기본값',sans:'고딕',serif:'명조',mono:'고정폭',scale:'전체 글자 크기',import:'글꼴 가져오기',remove:'현재 가져온 글꼴 삭제',reset:'기본 글꼴과 크기로 복원',preview:'미리보기: 中文 English 日本語 한국어 0123456789',hint:'프롬프트, 대화, 매개변수를 포함한 앱 내 모든 글자에 적용됩니다. 시스템 창은 OS 설정을 따릅니다. TTF / OTF, 파일당 최대 20 MiB. 원본 변경 없이 기기에 저장됩니다.',failed:'작업 실패. 이전 설정이 유지됩니다.',missing:'글꼴을 사용할 수 없어 기본 글꼴을 사용합니다. 다시 가져오세요.',saved:'저장됨',familyHint:'기본 글꼴과 고딕은 비슷할 수 있습니다. 중국어 차이는 명조에서 확인하세요. 가져온 글꼴에 없는 문자는 시스템 글꼴로 표시됩니다.'};
  return language==='en-US'?en:zh;
}
