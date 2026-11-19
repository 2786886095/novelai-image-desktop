export interface V5Intent {color?:'color'|'mono'; bubbles?:'ignore'|'extract';contentOnly?:boolean}
const monoHeader='黑白日漫：继承画师串，统一明暗灰度与网点。';
export const v5MonoRequested=(input:string)=>input.startsWith(monoHeader+'\n')&&input.includes('\n\n用户输入：\n');
export function v5Input(text:string,flags:V5Intent,reverse=false):string{
 const choices=[flags.color==='mono'?monoHeader:'全彩：继承工作台画师串，不添加色彩档词。',flags.bubbles==='extract'?'将实际对白作为图内文字，提取台词但不杜撰；Text: 放在所属段末。':'忽略气泡与图内文字，不写 Text:。'];
 if(reverse)choices.push(flags.contentOnly!==false?'仅反推可见内容，不复制画风或画师串。':'允许描述可观察的笔触和媒材；不推断画师身份。');
 return choices.join('\n')+'\n\n用户输入：\n'+text;
}
export function promptMetrics(prompt:string){const segments=prompt.split(/\s*\|\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/);const counts=segments.map(s=>s.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).filter(x=>x.trim()).length);
 const flags=[/\b(?:window|door|beam|arch|panel|wall|frame|pane|column|mullion)\w*\b/i,/\b(?:black|white|red|blue|gray|grey|green|brown|pink|yellow|silver|dark|pale)\b[^|,]{0,24}\b(?:coat|dress|shirt|ribbon|jacket|skirt|suit|pants)\b/i,/\b(?:two|second|three|third|four|pair of|double)\b/i,/\b(?:slim|petite|tall|muscular|lean|stocky|broad shoulders|short stature)\b/i].map(re=>re.test(prompt));const textChars=Array.from(Array.from(prompt.matchAll(/\bText:\s*"((?:\\.|[^"\\])*)"/gi),m=>m[1]).join('')).length;
 return {counts,units:counts.reduce((a,b)=>a+b,0),flags,textChars};
}
