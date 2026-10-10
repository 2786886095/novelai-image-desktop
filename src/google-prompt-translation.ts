/** Preserve prompt controls locally; translate ordinary text by default.
 * Only explicit/qualified names or category 1/3/4 are protected. An unavailable
 * optional index cannot prove an unknown label is a name: it must not suppress
 * ordinary words or prose. No fixed descriptive vocabulary or ASCII-only gate. */
type Piece = {literal: string} | {tag: string; prefix: string; suffix: string; term?: number};
export interface GooglePromptTranslationPlan {
  queries: string[];
  restore: (translated: string[]) => string;
}
const key = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const protectedAtom = /^(?:(?:artist|character|copyright):[^,{}\[\]|\r\n]+|[^\s(),{}\[\]|]+\([^()]*\)|https?:\/\/[^\s,{}|]+|[^\s,{}|]+\.(?:png|webp|jpe?g|gif|avif|bmp|vibe|json)|[+-]?(?:\d+(?:\.\d+)?|\.\d+))$/i;
const resourceAtom = /^(?:https?:\/\/[^\s,{}|]+|[^\s,{}|]+\.(?:png|webp|jpe?g|gif|avif|bmp|vibe|json))(?=$|[\s,{}|])/i;


function piecesOf(text: string): Piece[] {
  const pieces: Piece[] = [];
  // Parenthesized qualifiers belong to a name. Commas inside them aren't tags.
  let start = 0, depth = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end), m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw)!;
    let tag=m[2], prefix=m[1], suffix=m[3];
    // Preserve ordinary attention parentheses / :weight, but not name_(work).
    while (tag.startsWith('(') && tag.endsWith(')')) {
      const inner=tag.slice(1,-1), weighted=/^(.*?)(:[+-]?\d+(?:\.\d+)?)$/.exec(inner);
      prefix+='(';tag=weighted?.[1]??inner;suffix=(weighted?.[2]??'')+')'+suffix;
    }
    const innerSpace=/^(\s*)([\s\S]*?)(\s*)$/.exec(tag)!;
    prefix+=innerSpace[1];tag=innerSpace[2];suffix=innerSpace[3]+suffix;
    pieces.push({tag,prefix,suffix});
  };
  for (let i=0;i<text.length;i++) {
    // Brackets in resource names are not prompt attention delimiters.
    if (i === start || /\s/.test(text[i-1])) {
      const resource = resourceAtom.exec(text.slice(i));
      if (resource) { i += resource[0].length-1; continue; }
    }
    if(text[i]==='(')depth++; else if(text[i]===')')depth=Math.max(0,depth-1);
    if(depth)continue;
    const delimiter=/^(?:[+-]?(?:\d+(?:\.\d+)?|\.\d+)::|::|[{},\[\]|\r\n])/.exec(text.slice(i));
    if(!delimiter)continue;
    push(i);pieces.push({literal:delimiter[0]});i+=delimiter[0].length-1;start=i+1;
  }
  push(text.length);return pieces;
}

export async function prepareGooglePromptTranslation(text: string,
  lookupCategory?: (tag: string) => Promise<number | undefined>): Promise<GooglePromptTranslationPlan> {
  if (protectedAtom.test(text.trim())) return {queries:[],restore:()=>text};
  if (!/[_{}()\[\]|,]|::|\b(?:artist|character|copyright):|(?:^|[,\s])\d+(?:girls?|boys?)\b/.test(text)) {
    return {queries:[text],restore:values=>values[0].trim()};
  }
  if(text.length>20_000)throw Error('提示词过长，请分段翻译。');
  const pieces=piecesOf(text), terms:string[]=[], indexes=new Map<string,number>(), categories=new Map<string,number|undefined>();
  for(const piece of pieces) {
    if('literal' in piece || !piece.tag)continue;
    const tag=piece.tag, normalized=key(tag);
    // Structural/qualified names, links, file names and explicit name namespaces.
    if(protectedAtom.test(tag))continue;
    if(!categories.has(normalized)) {
      let category:number|undefined;
      try {category=await lookupCategory?.(tag);}catch{/* An optional local index cannot block translation. */}
      categories.set(normalized,category);
    }
    const category=categories.get(normalized);
    if(category===1 || category===3 || category===4)continue;
    const term=tag.replace(/_/g,' ').replace(/^(\d+)(girls?|boys?)\b/,'$1 $2');
    if(term.length>1200)throw Error('单段提示词过长，请分段翻译。');
    if(!indexes.has(term)){indexes.set(term,terms.length);terms.push(term);}
    piece.term=indexes.get(term);
  }
  // One bounded request for ordinary prompts; deduplicate repeated labels.
  const batches:string[][]=[];let batch:string[]=[];
  for(const term of terms) {
    if(batch.length && batch.join('\n').length+term.length+1>1200){batches.push(batch);batch=[];}
    batch.push(term);
  }
  if(batch.length)batches.push(batch);
  return {
    queries:batches.map(b=>b.join('\n')),
    restore(values) {
      if(values.length!==batches.length)throw Error('谷歌翻译标签结果不完整，未应用译文。');
      const translated:string[]=[];
      for(let i=0;i<values.length;i++) {
        const lines=values[i].trim().split(/\r?\n/).map(s=>s.trim());
        if(lines.length!==batches[i].length || lines.some(s=>!s||/::|[{},，\[\]|]/.test(s))) {
          throw Error('谷歌翻译标签结果错位，未应用译文。');
        }
        translated.push(...lines);
      }
      return pieces.map(p=>'literal' in p?p.literal:p.prefix+(p.term===undefined?p.tag:translated[p.term])+p.suffix).join('');
    },
  };
}
