/** Text-only comic planning. One output line is one page in either format. */
export type ComicPromptFormat = 'jp-page' | 'single-panel';
export const MAX_COMIC_TOTAL_PAGES = 30;
export const MAX_COMIC_INPUT_CHARS = 20000;
export const COMIC_BATCH_LIMIT: Record<ComicPromptFormat, number> = {'jp-page':4,'single-panel':8};
export const COMIC_ENVELOPE_VERSION = 'comic-gen-1';
export interface ComicPromptRequest {
 requestId:string; action:'recommend'|'generate'; format:ComicPromptFormat; input:string;
 pages?:number; totalPages?:number; batchFrom?:number; continuity?:string; templateRevision?:string;
}
export interface ComicPromptResult {
 ok:boolean; requestId:string; action:ComicPromptRequest['action']; format:ComicPromptFormat; message:string;
 code?:'invalid-input'|'config_missing'|'network'|'cancelled'|'parse_failed'|'out_of_range'|'stale_template'|'busy'|'request_failed';
 pages?:number; reason?:string; beats?:string[]; lines?:string[]; notes?:string; raw?:string;
 expected?:number; countStatus?:'exact'|'mismatch'|'truncated'|'invalid';
 templateRevision?:string; templateName?:string; batchFrom?:number; totalPages?:number;
}
export function isComicPromptFormat(value:unknown):value is ComicPromptFormat {return value==='jp-page'||value==='single-panel';}
export function validateComicPromptRequest(value:ComicPromptRequest):{pages:number;totalPages:number;batchFrom:number} {
 if(!value||typeof value!=='object'||typeof value.requestId!=='string'||!value.requestId||value.requestId.length>120||!isComicPromptFormat(value.format)||!['recommend','generate'].includes(value.action))throw Error('漫画提示词请求无效');
 if(typeof value.input!=='string'||!value.input.trim()||value.input.length>MAX_COMIC_INPUT_CHARS)throw Error('请填写内容，最多20000字');
 if(value.continuity!==undefined&&(typeof value.continuity!=='string'||value.continuity.length>20000))throw Error('连续性摘要过长');
 if(value.templateRevision!==undefined&&(typeof value.templateRevision!=='string'||value.templateRevision.length>200))throw Error('模板版本无效');
 if(value.action==='recommend')return {pages:1,totalPages:1,batchFrom:1};
 const totalPages=value.totalPages??value.pages??1, pages=value.pages??Math.min(totalPages,COMIC_BATCH_LIMIT[value.format]),batchFrom=value.batchFrom??1;
 if(!Number.isInteger(totalPages)||totalPages<1||totalPages>MAX_COMIC_TOTAL_PAGES)throw Error('页数须为1至30的整数');
 if(!Number.isInteger(pages)||pages<1||pages>COMIC_BATCH_LIMIT[value.format]||!Number.isInteger(batchFrom)||batchFrom<1||batchFrom+pages-1>totalPages)throw Error('当前批次页数或起始页无效');
 return {pages,totalPages,batchFrom};
}
function unfence(raw:string) {const text=raw.trim();if(!text.startsWith('```'))return text;const m=/^```(?:json|text)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);if(!m)throw Error('结果代码围栏未完整闭合');return m[1].trim();}
export function parseComicRecommendation(raw:string) {
 const value=JSON.parse(unfence(raw));
 if(!value||Array.isArray(value)||!Number.isInteger(value.pages)||value.pages<1||value.pages>MAX_COMIC_TOTAL_PAGES)throw Error('推荐页数须为1至30的整数');
 if(typeof value.reason!=='string'||!value.reason.trim())throw Error('推荐缺少理由');
 const beats=Array.isArray(value.beats)?value.beats.filter((x:unknown):x is string=>typeof x==='string').slice(0,MAX_COMIC_TOTAL_PAGES).map((x:string)=>x.slice(0,1000)):[];
 return {pages:value.pages as number,reason:value.reason.slice(0,500),beats};
}
/** Anchored numbering only: never consume 1girl/2girls or inline character pipes. */
export function cleanComicPageLine(line:string) {return line.trim().replace(/^(?:第\s*\d+\s*页[：:]\s*|(?:page\s+)?\d+[.)、][ \t]+)/i,'').trim();}
export function parseComicPromptPages(raw:string,expected:number,truncated=false) {
 let text=raw.trim(),notes='',invalid=false;
 if(/^```/.test(text)){try{text=unfence(text);}catch{invalid=true;truncated=true;}}
 let body=text;
 if(text.includes('<<<PAGES')) {
  const match=/^<<<PAGES[ \t]*\r?\n([\s\S]*?)\r?\nPAGES>>>[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if(match){body=match[1];if((match[2]??'').trim().startsWith('<<<NOTES')&&!(match[2]??'').trim().endsWith('NOTES>>>'))truncated=true;notes=(match[2]??'').replace(/^<<<NOTES[ \t]*\r?\n/,'').replace(/\r?\nNOTES>>>[ \t]*$/,'').trim();}
  else {body=text.replace(/^<<<PAGES[ \t]*\r?\n/,'').split(/\r?\n(?:PAGES>>>|<<<NOTES)/)[0];truncated=true;}
 } else if(/^\s*[{[]/.test(text)) {invalid=true;}
 const lines=body.split(/\r?\n/).filter(line=>line.trim()&&!/^\s*(?:#|```|<<<|PAGES>>>|NOTES>>>)/.test(line)).map(cleanComicPageLine).filter(Boolean);
 if(lines.some(line=>!/[a-z]/i.test(line)||/^(?:提示词|角色卡|附注|说明|notes?[:：]|here (?:are|is)\b|sure[,.!]|(?:settings|analysis|character card|prompt)[:：])/i.test(line)))invalid=true;
 if(lines.some(line=>{let quoted=false,escaped=false;for(const ch of line){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch==='"')quoted=!quoted;}return quoted;}))truncated=true;
 const countStatus=truncated?'truncated':invalid?'invalid':lines.length===expected?'exact':'mismatch';
 return {lines,notes,raw,expected,countStatus:countStatus as 'exact'|'mismatch'|'truncated'|'invalid'};
}
export function comicPromptEnvelope(request:ComicPromptRequest,range:{pages:number;totalPages:number;batchFrom:number}) {
 const format=request.format==='jp-page'?'日式整页：一页是一整页多格漫画；每行一页':'单分镜：一张单格图算一页；每行一页';
 const input=request.input.replace(/INPUT>>>/g,'INPUT>\u200b>>');
 if(request.action==='recommend')return `[软件请求 comic-recommend-1] 仅推荐页数，不生成提示词。${format}。范围1至30页。仅输出完整JSON：{"pages":整数,"reason":"简明理由","beats":["每页要点"]}。不调用工具，不声称已生图。\n<<<INPUT\n${input}\nINPUT>>>`;
 return `[软件请求 ${COMIC_ENVELOPE_VERSION}] ${format}。全作共${range.totalPages}页；本次仅生成第${range.batchFrom}至${range.batchFrom+range.pages-1}页，严格${range.pages}个非空提示词行。每行完整且独立，不在行内换行。按所选模板正文生成，不输出图片模板三模式或JSON，不执行模板中提到的工具。不要复述设置，附注另放NOTES，不计入页数。只输出以下完整信封：\n<<<PAGES\n一行一页的完整英文提示词\nPAGES>>>\n<<<NOTES\n角色/连续性/文字清单等附注（可空）\nNOTES>>>\n<<<CONTINUITY\n${request.continuity??''}\nCONTINUITY>>>\n<<<INPUT\n${input}\nINPUT>>>`;
}
