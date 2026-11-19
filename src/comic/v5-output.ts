/** Normalize generated prompt output only; never normalize editable drafts or the retained raw reply. */
export type V5OutputOptions={mono?:boolean;jp?:boolean};
const hue=/\b(?:(light|dark|deep|pale|bright)[ -]+)?(ice[ -]blue|red|crimson|scarlet|blue|navy|brown|amber|golden|yellow|orange|pink|purple|violet|green|emerald|cyan|warm|cool)\b/gi;
const carriers=/\b(?:speech (?:bubble|balloon)|thought (?:bubble|balloon)|narrat(?:or|ion) box|caption box|title band)\b/i;
const panelBoundary=/[,;]\s*(?=(?:(?:in|on) the |(?:a |the ))?(?:(?:full[- ]width|top|upper|left|right|middle|lower|bottom|central|center|inset|first|second|third|fourth|last|wide|small|large)[ -]+){1,5}panel\b(?:\s*:|\s+(?:a |an |the |shows\b|depicts\b|features\b)))/gi;
const clean=(s:string)=>s.replace(/^[\s,;]+|[\s,;]+$/g,'');
export function normalizeV5Output(input:string,opts:V5OutputOptions={}):string{
 // Mask complete quotes (including escaped quotes) before inspecting pipes, hues or panel directions.
 let prefix='\uE000';while(input.includes(prefix))prefix+='\uE000';
 const quotes:string[]=[];const quoted=input.replace(/"(?:\\.|[^"\\])*"/g,q=>prefix+(quotes.push(q)-1)+'\uE001');
 const textRE=new RegExp('\\bText\\s*:\\s*'+prefix+'\\d+\uE001','gi');
 let work=quoted;const weights:string[]=[];
 if(opts.jp){
  // A negative weight appended after a dialogue is page-level, not printable text.
  work=work.split('|').map(segment=>{const offset=segment.search(textRE);if(offset<0)return segment;
   return segment.slice(0,offset)+segment.slice(offset).replace(/(?:,\s*)?(-\d+(?:\.\d+)?::[^|:]*?::)/g,(_,w)=>{weights.push(w);return '';});}).join('|');
  work=work.split('|').map(segment=>segment.replace(panelBoundary,(m,offset:number)=>/^\s*(?:girl|boy|other|person)\s*$/i.test(segment.slice(0,offset))?m:' | ')).join('|');
 }
 if(opts.mono){
  const keep=String.raw`\b(?:artist|character|copyright):[^,|\n]+|\b(?:warm up|cool down|(?:warm|cool) (?:smile|gaze|expression|personality|attitude))\b`;
  work=work.replace(new RegExp('(?:'+keep+')|'+hue.source,'gi'),(m,shade:string|undefined,color:string|undefined)=>{
   if(!color)return m;
   if(/^(warm|cool)$/i.test(color))return 'neutral';
   if(/^(dark|deep)$/i.test(shade??'')||(!shade&&/^(navy|brown|crimson|purple)$/i.test(color)))return 'dark grey';
   if(/^(pale|light|bright)$/i.test(shade??'')||(!shade&&/^(yellow|golden|pink|ice[ -]blue)$/i.test(color)))return 'pale grey';
   return 'mid-grey';
  });
 }
 const parts=work.split('|').map(clean).filter(Boolean);
 const result:string[]=[];
 for(const part of parts){
  const matches=[...part.matchAll(textRE)];
  if(!matches.length){result.push(part);continue;}
  let begin=0;
  for(let i=0;i<matches.length;i++){
   const m=matches[i],end=m.index!+m[0].length;
   let before=clean(part.slice(begin,m.index));const tail=i===matches.length-1?clean(part.slice(end)):'';
   if(!opts.jp&&tail)before=[before,tail].filter(Boolean).join(', ');
   if(!carriers.test(before.replace(/-\d+(?:\.\d+)?::[^:]*::/g,''))){const q=quotes[Number(m[0].slice(m[0].indexOf(prefix)+prefix.length,-1))]??'';
    const lang=/[\u4e00-\u9fff]/.test(q)?'chinese text, ':'';
    before=[before.replace(/(?:气泡|對話框|对话框)\s*[：:]\s*$/,''),(/\btext\b/i.test(before)?'':'text, '+lang)+'a speech bubble in the upper right clear of the face'].filter(Boolean).join(', ');
   }
   result.push([before,m[0]].filter(Boolean).join(', '));if(opts.jp&&tail)result.push(tail);
   begin=end;
  }
 }
 if(weights.length&&result.length){const marker=result[0].search(/\b(?:text\s*,|Text\s*:)/i);const blocks=[...new Set(weights)].join(', ');result[0]=marker<0?clean(result[0])+', '+blocks:[clean(result[0].slice(0,marker)),blocks,result[0].slice(marker)].filter(Boolean).join(', ');}
 return result.join(' | ').replace(new RegExp(prefix+'(\\d+)\uE001','g'),(_,n)=>quotes[Number(n)]);
}
export function monoApprovedPage(raw:string|undefined){
 if(!raw)return raw;
 const strip=(obj:unknown):unknown=>Array.isArray(obj)?obj.map(strip):obj&&typeof obj==='object'?Object.fromEntries(Object.entries(obj).filter(([k])=>!/^colou?r$/i.test(k)).map(([k,v])=>[k,strip(v)])):obj;
 try{const page=JSON.parse(raw);if(!page||typeof page!=='object'||!('characters' in page))return raw;
  if(typeof page.characters==='string'){const chunks=page.characters.split(/\r?\n\s*\r?\n/);page.characters=chunks.map((c:string)=>{try{return JSON.stringify(strip(JSON.parse(c)));}catch{return c;}}).join('\n\n');}
  else page.characters=strip(page.characters);return JSON.stringify(page);
 }catch{return raw;}
}
