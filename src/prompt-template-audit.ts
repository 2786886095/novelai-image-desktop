export function cameraIntentSource(source:string){return source.replace(/\b(?:lit|illuminated|lighting|light)\s+from (?:above|below)\b/gi,'light direction');}
export function explicitAttributeColor(source:string,part:'hair'|'eyes'):string[]|undefined {
 const colors:Record<string,string[]>={'白':['white'],'银':['silver'],'银白':['silver','white'],'黑':['black'],'红':['red'],'蓝':['blue'],'金':['blonde','blond'],'紫':['purple'],'棕':['brown']};
 const canonical=part==='hair'?/(银白|白|银|黑|红|蓝|金|紫|棕)(?:色)?(?:长|短)?发|\b(white|silver|black|red|blue|blonde|purple|brown) hair\b/gi:/(白|银|黑|红|蓝|金|紫|棕)(?:色)?(?:眼睛|眼|瞳)|\b(white|silver|black|red|blue|golden|purple|brown) eyes\b/gi;
 const relational=new RegExp((part==='hair'?'(?:头发(?:的)?颜色|头发|发色|hair(?:\\s+colou?r)?)':'(?:眼睛(?:的)?颜色|瞳色|眼睛|eye(?:s)?(?:\\s+colou?r)?)')+'\\s*(?:改为|改成|换成|变为|变成|调整为|设置为|设为|是|为|to|is|[:：])\\s*(银白|白|银|黑|红|蓝|金|紫|棕|white|silver|black|red|blue|blonde|golden|purple|brown)(?:色)?','gi');
 const matches=[...source.matchAll(canonical),...source.matchAll(relational)].filter(m=>!/(?:不要|不能|禁止|别|不允许)(?:把|将)?[^，。\n]{0,8}$/.test(source.slice(Math.max(0,(m.index??0)-12),m.index))).sort((a,b)=>(a.index??0)-(b.index??0));
 const latest=matches.at(-1);if(!latest)return undefined;const color=(latest[1]??latest[2]).toLowerCase();return colors[color]??[color];
}
// The converter emits a typed transport envelope; only its validated, ordered
// text is sent to NovelAI. These checks are not a universal semantic proof.
export function mixedTemplateContract(template:string,mode:string,allowSparse=true) {
  const range=template.match(/计数口径[^\n]*?(\d{1,3})\s*[–—-]\s*(\d{1,3})/) ?? template.match(/有效语义单元[\s\S]{0,80}?(\d{1,3})\s*[–—-]\s*(\d{1,3})/);
  if(mode!=='mixed'||!range||!/(?:65\s*[–—-]\s*75|70)\s*%/.test(template))return null;
  return {min:allowSparse&&/极短输入允许\s*25\s*[–—-]\s*49/.test(template)?25:Number(range[1]),max:Number(range[2]),tagMin:.65,tagMax:.75};
}
export const mixedEnvelopeInstruction=`软件内部输出协议（不改变上文最终提示词的内容要求）：返回 JSON 对象 {"segments":[{"units":[{"kind":"tag","text":"1girl"},{"kind":"natural","text":"her left hand rests on the railing"}]}]}。每个 units 项恰好是一个有效单元（通常无逗号；引号内画面文字允许逗号和中文，不能拆开）。单人一个 segment；多人 base 与角色段各一个 segment，角色段开头使用 girl/boy/other。kind 只能 tag 或 natural。成熟 Tag 用 tag；位置、身体侧、关系、层次的自然短语用 natural，不要把短 Tag 假标 natural 或把完整句子标 tag。最终由软件按逗号、段间竖线拼接，用户和生图接口只收到纯提示词，不收到 JSON。
先遵守不虚构和短输入例外，再规划数量：信息充分的普通单人建议 60 个不重复单元（42 Tag + 18 自然短语），不是恰好卡在下限。保持所选模板的上下限与比例。自然短语增加明确关系，不重复 Tag。原始用户要求高于 Agent 转述和历史助手补写；旧约束只在新消息明确改变时更新。不改变已指定发色、瞳色、人数、场景、镜头；不要为了凑数新增关键衣服、人物或情节。`;

export function patchMixedEnvelope(previous:string,raw:string){
  const envelope=JSON.parse(previous),patch=JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(!patch||Array.isArray(patch)||Object.keys(patch).some(k=>!['replace','append','remove'].includes(k)))throw Error('校正需要 replace/append/remove 增量，不能重写整条提示词');
  const targets=new Set<string>();
  const validUnit=(unit:any)=>unit&&['tag','natural'].includes(unit.kind)&&typeof unit.text==='string'&&!!unit.text.trim();
  for(const operation of ['replace','append','remove'] as const){
    if(patch[operation]!==undefined&&!Array.isArray(patch[operation]))throw Error('校正操作需要数组');
    for(const entry of patch[operation]??[]){
      if(!entry||!Number.isInteger(entry.segment)||entry.segment<0||!Array.isArray(envelope.segments?.[entry.segment]?.units))throw Error('校正索引无效');
      if(operation==='append'){
        if(!Array.isArray(entry.units)||entry.units.length>150||!entry.units.every(validUnit))throw Error('补足单元格式无效');
      }else{
        if(!Number.isInteger(entry.index)||entry.index<0||!envelope.segments[entry.segment].units[entry.index])throw Error('校正索引无效');
        const key=entry.segment+':'+entry.index;
        if(targets.has(key))throw Error('校正索引重复或冲突，不能删除或替换相邻正确事实');
        targets.add(key);
        if(operation==='replace'&&!validUnit(entry.unit))throw Error('替换单元格式无效');
      }
    }
  }
  for(const entry of patch.replace??[]){
    if(!Number.isInteger(entry.segment)||!Number.isInteger(entry.index)||!envelope.segments[entry.segment]?.units[entry.index])throw Error('校正索引无效');
    envelope.segments[entry.segment].units[entry.index]=entry.unit;
  }
  for(const entry of [...(patch.remove??[])].sort((a,b)=>b.index-a.index)){
    if(!Number.isInteger(entry.segment)||!Number.isInteger(entry.index)||!envelope.segments[entry.segment]?.units[entry.index])throw Error('删除索引无效');
    envelope.segments[entry.segment].units.splice(entry.index,1);
  }
  for(const entry of patch.append??[]){
    if(!Number.isInteger(entry.segment)||!envelope.segments[entry.segment]||!Array.isArray(entry.units)||entry.units.length>150)throw Error('补足单元格式无效');
    envelope.segments[entry.segment].units.push(...entry.units);
  }
  return JSON.stringify(envelope);
}

// Bounded identity, not general semantic similarity. Only these complete Tag
// alternatives express the same pose/camera fact; never erase qualifiers,
// ownership prefixes, a differing weight or distinct visible-text payloads.
export function promptUnitIdentity(kind:string,text:string):string {
  const literal=text.trim();
  if(/["「]/.test(literal)||/(?:^|::)\s*Text:/i.test(literal))return kind+'\nliteral\n'+literal;
  const folded=literal.toLowerCase().replaceAll('_',' ').replace(/\s+/g,' ');
  if(kind!=='tag')return kind+'\n'+folded;
  const weighted=folded.match(/^(-?\d+(?:\.\d+)?)::\s*(.*?)\s*::$/);
  const body=(weighted?weighted[2]:folded).trim();
  const aliases:Record<string,string>={'head back':'head tilted back','head tilted back':'head tilted back','leaning forward':'leaning forward','body leaning forward':'leaning forward','from side':'from the side','from the side':'from the side','side view':'from the side','rock':'rock','stone':'rock','mist':'mist','misty':'mist','shrub':'shrub','bush':'shrub'};
  return kind+'\n'+(weighted?'weight:'+weighted[1]:'plain')+'\n'+(aliases[body]??body);
}

// A layer name alone supplies no pictured object or attribute. Only unweighted,
// complete structural labels are removable; keep qualifiers, prefixes and text.
export function isBareLayerLabel(kind:string,text:string):boolean {
  return kind==='tag'&&/^(foreground|background)$/i.test(text.trim());
}

function plainUnit(text:string):string {
  return text.toLowerCase().replaceAll('_',' ').replace(/-?\d+(?:\.\d+)?::|::/g,'').replace(/\s+/g,' ').trim();
}
function isLiteralUnit(text:string):boolean {
  return /["「]/.test(text)||/(?:^|::)\s*Text:/i.test(text);
}
function isNaturalRelation(text:string):boolean {
  if(isLiteralUnit(text))return false;
  const plain=plainUnit(text);
  return /\b(?:her|his|their|she|he|they|which|while|beneath|in front of|with (?:one|both)|on the)\b/.test(plain)||plain.split(' ').length>6;
}
function isShortNaturalRelation(plain:string):boolean {
  return /^(?:on the (?:left|right)|in the (?:middle|center)|to (?:her|his|their) (?:left|right)|(?:behind|beside|above|below|beneath) (?:her|him|them))$/.test(plain);
}
// A count is metadata only when the complete Tag says so. Do not count quoted
// lettering, natural prose or negative-weight exclusions as pictured people.
function segmentPeople(units:any[]):number {
  return units.reduce((sum,unit)=>{
    if(unit?.kind!=='tag'||typeof unit.text!=='string')return sum;
    const raw=unit.text.trim(),weighted=raw.match(/^(-?\d+(?:\.\d+)?)::\s*(.*?)\s*::$/);
    if(weighted&&Number(weighted[1])<=0)return sum;
    const count=(weighted?weighted[2]:raw).trim().match(/^(\d+)(?:girls?|boys?|others?)$/i);
    return sum+(count?Number(count[1]):0);
  },0);
}
// Global count directives outrank incidental introductions of each character.
// Adjacent count Tags form one directive (1girl, 1boy means two, not solo).
function sourcePeople(source:string):number|undefined {
  const names:Record<string,number>={'单人':1,'solo':1,'两人':2,'双人':2,'三人':3,'四人':4,'五人':5,'六人':6,'七人':7,'八人':8,'九人':9,'十人':10,'多人':0};
  const explicit=[...source.matchAll(/单人|两人|双人|三人|四人|五人|六人|七人|八人|九人|十人|多人|\bsolo\b|\b\d{1,2}(?:girls?|boys?|others?)\b/gi)];
  const last=explicit.at(-1);
  if(last){
    const text=last[0].toLowerCase();
    if(text in names)return names[text]||undefined;
    let count=Number(text.match(/^\d+/)![0]),start=last.index!;
    for(let i=explicit.length-2;i>=0;i--){
      const previous=explicit[i];
      if(!/^\d/.test(previous[0])||! /^[\s,+，、和与及&]*$/.test(source.slice(previous.index!+previous[0].length,start)))break;
      count+=Number(previous[0].match(/^\d+/)![0]);start=previous.index!;
    }
    return count;
  }
  if(/另(?:一|个)|another\s+(?:girl|boy|woman|man|person)/i.test(source))return undefined;
  const introductions=[...source.matchAll(/(?:一位|一个)[^，。\n；]{0,12}?(?:女孩|少女|女性|男孩|男性|男人|女人)/g)];
  return introductions.length===1?1:undefined;
}

// Keep the first literal unit and its order. Counts are recomputed after removal;
// cleanup must fail a hard minimum rather than pad it with invented content.
export function normalizeMixedEnvelope(raw:string,options:{repairMetadata?:boolean}={}):string {
  const envelope=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(!Array.isArray(envelope?.segments))return JSON.stringify(envelope);
  for(const [index,segment] of envelope.segments.entries()){
    if(!Array.isArray(segment?.units))continue;
    const seen=new Set<string>();
    segment.units=segment.units.filter((unit:any)=>{
      if(!['tag','natural'].includes(unit?.kind)||typeof unit.text!=='string')return true;
      // Classification repairs transport metadata, never the pictured text or
      // its weight. Short natural units remain subject to the strict audit.
      if(options.repairMetadata&&unit.kind==='tag'&&isNaturalRelation(unit.text))unit.kind='natural';
      if(options.repairMetadata&&index>0&&unit===segment.units[0]&&unit.kind==='tag'&&/^1(girl|boy|other)$/i.test(unit.text.trim()))unit.text=unit.text.trim().slice(1).toLowerCase();
      if(isBareLayerLabel(unit.kind,unit.text))return false;
      const key=promptUnitIdentity(unit.kind,unit.text);
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  return JSON.stringify(envelope);
}

export function auditMixedEnvelope(raw:string,source:string,contract:NonNullable<ReturnType<typeof mixedTemplateContract>>,options:{allowStyleTags?:boolean;tagOnly?:boolean}={}) {
  const issues:string[]=[];
  let envelope:any;
  try{envelope=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('内部模板结果需要有效的分段 JSON，未提交生图');}
  if(!Array.isArray(envelope?.segments)||!envelope.segments.length||envelope.segments.length>23)throw Error('模板结果缺少有效段落');
  let total=0,tags=0,natural=0;const texts:string[]=[];
  for(const [index,segment] of envelope.segments.entries()){
    if(!Array.isArray(segment.units)||!segment.units.length)throw Error('模板段落没有有效单元');
    const seen=new Set<string>(),units:string[]=[];let localNatural=0;
    for(const [unitIndex,unit] of segment.units.entries()){
      if(!['tag','natural'].includes(unit.kind)||typeof unit.text!=='string'||!unit.text.trim())throw Error('单元需要 kind 与非空 text');
      const text=unit.text.trim(),plain=plainUnit(text);
      const syntax=text.replace(/"[^"\r\n]*"|「[^」\r\n]*」/g,'"text"').replace(/^Text:\s*[^|\r\n]*$/i,'Text: text');
      if(/[,，|\r\n]/.test(syntax))issues.push(`segments[${index}].units[${unitIndex}] 每个单元不可含逗号或分段符：${text}`);
      if(/[\u4e00-\u9fff]/.test(syntax))issues.push('提示词只能包含英文',`segments[${index}].units[${unitIndex}] 提示词只能包含英文`);
      const duplicateKey=/["「]/.test(text)||/(?:^|::)\s*Text:/i.test(text)?'literal\n'+text:plain;
      if(seen.has(duplicateKey))issues.push(`segments[${index}].units[${unitIndex}] 重复单元：${text}（删除此索引，保留第一次出现）`);seen.add(duplicateKey);
      if(!options.allowStyleTags&&/artist:|\b(?:masterpiece|best quality|amazing quality|very aesthetic)\b/.test(plain))issues.push(`segments[${index}].units[${unitIndex}] 场景转换不应添加画师或质量词：`+text);
      if(unit.kind==='tag'){
        if(/^(foreground|background)$/.test(plain))issues.push('层级标签缺少具体事实：'+text);
        tags++;
        if(isNaturalRelation(text))issues.push(`segments[${index}].units[${unitIndex}] 自然关系短语被标成 Tag：`+text);
      }else{
        natural++;localNatural++;
        if(plain.split(' ').length<4&&!isShortNaturalRelation(plain))issues.push(`segments[${index}].units[${unitIndex}] 短 Tag 被标成自然语言：`+text);
      }
      units.push(text);total++;
    }
    if(envelope.segments.length>1&&index>0){
      if(segment.units[0].kind!=='tag'||!/^(girl|boy|other)\b/i.test(units[0]))issues.push(`segments[${index}].units[0] 角色段必须以 girl/boy/other 开头`);
      if(!localNatural&&!options.tagOnly)issues.push('每个角色段需要至少一个位置或关系短语');
    }
    texts.push(units.join(', '));
  }
  const prompt=texts.join(' | '),normalized=prompt.toLowerCase().replaceAll('_',' '),ratio=tags/Math.max(1,total);
  const indexConflicts=(pattern:RegExp,message:string)=>{
    for(const [s,segment] of envelope.segments.entries())for(const [u,unit] of segment.units.entries()){
      if(!isLiteralUnit(unit.text)&&pattern.test(plainUnit(unit.text)))issues.push(`segments[${s}].units[${u}] ${message}`);
    }
  };
  if(total<contract.min||total>contract.max)issues.push(`有效单元 ${total}，要求 ${contract.min}–${contract.max}`);
  if(ratio<contract.tagMin||ratio>contract.tagMax)issues.push(options.tagOnly?'纯 Tag 模式不能混入自然语言单元':`Tag ${tags}/${total}（${(ratio*100).toFixed(1)}%），应为65–75%；自然语言应为25–35%`);
  // Preserve common explicit single-character facts; multi-character associations
  // remain in their segments rather than imposing one hair color on all people.
  if(envelope.segments.length===1){
    for(const part of ['hair','eyes'] as const){
      const allowed=explicitAttributeColor(source,part);
      if(allowed){
        const actual=[...normalized.matchAll(new RegExp('\\b(white|silver|black|red|blue|blonde|blond|golden|purple|brown) '+part+'\\b','g'))].map(x=>x[1]);
        if(!actual.some(x=>allowed.includes(x))||actual.some(x=>!allowed.includes(x)))issues.push(`用户指定 ${allowed.join('/')} ${part}，不可遗漏或替换`);
        const wrong=['white','silver','black','red','blue','blonde','blond','golden','purple','brown'].filter(x=>!allowed.includes(x));
        indexConflicts(new RegExp('\\b('+wrong.join('|')+') '+part+'\\b'),`用户指定 ${allowed.join('/')} ${part}，不可替换`);
      }
    }
  }
  const requestedPeople=sourcePeople(source),actualPeople=segmentPeople(envelope.segments[0].units);
  if(requestedPeople===1&&(actualPeople!==1||texts.length>1))issues.push('保留用户指定的单人数量');
  if(requestedPeople!==undefined&&requestedPeople>1&&(actualPeople!==requestedPeople||texts.length-1!==requestedPeople))issues.push('保留用户指定的人物数量');
  const latestTime=[...source.matchAll(/雨夜|雨天|傍晚|黄昏|日落|夕阳|白天|清晨|黎明|rainy night|sunset|daytime/gi)].at(-1)?.[0];
  if(/^(?:雨夜|rainy night)$/i.test(latestTime??'')&&(!/\brain\b|\brainy\b/.test(normalized)||!/\bnight\b/.test(normalized)||/\bdaytime\b|\bsunset\b/.test(normalized)))issues.push('保留雨夜，不替换成白天或日落');
  if(/^(?:雨夜|rainy night)$/i.test(latestTime??''))indexConflicts(/\b(?:daytime|sunset)\b/,'保留雨夜，不替换成白天或日落');
  if(/透明.*(?:伞)|transparent umbrella/i.test(source)&&!/\btransparent umbrella\b/.test(normalized))issues.push('保留透明雨伞');
  const latestCamera=[...cameraIntentSource(source).matchAll(/俯视(?:机位|视角|镜头)|仰视(?:机位|视角|镜头)|平视(?:机位|视角|镜头)|from above|from below|eye level/gi)].at(-1)?.[0];
  if(/俯视|from above/i.test(latestCamera??'')&&(!/\bfrom above\b/.test(normalized)||/\bfrom below\b|\blow angle\b/.test(normalized)))issues.push('保留俯视机位 from above，不混入仰视机位');
  if(/俯视|from above/i.test(latestCamera??''))indexConflicts(/\b(?:from below|low angle)\b/,'保留俯视机位 from above，不混入仰视机位');
  const latestFraming=[...source.matchAll(/全身|上半身|半身|特写|full body|upper body|close.up/gi)].at(-1)?.[0];
  if(/全身|full body/i.test(latestFraming??'')&&(!/\bfull body\b/.test(normalized)||/\bupper body\b/.test(normalized)))issues.push('保留全身构图，不替换成上半身');
  if(/全身|full body/i.test(latestFraming??''))indexConflicts(/\bupper body\b/,'保留全身构图，不替换成上半身');
  if(/上半身|半身|upper body/i.test(latestFraming??'')){
    if(!/\bupper body\b/.test(normalized)||/\bfull body\b/.test(normalized))issues.push('保留上半身构图 upper body，不替换成全身');
    indexConflicts(/\bfull body\b/,'保留上半身构图 upper body，不替换成全身');
    if(!/脚|鞋|靴|腿|膝|\b(?:feet|shoes|boots|legs|knees)\b/i.test(source)&&/\b(?:both feet|her feet|his feet|long legs|full figure|head to toe|knees visible|shoes|boots|footwear|sandals|sneakers|high heels)\b/.test(normalized))issues.push('上半身构图不应补入展示双脚、长腿或全身的提示；删除未要求的取景冲突，保留明确衣着');
  }
  if(/\bupper body\b/.test(normalized)&&/\bfull body\b/.test(normalized))issues.push('全身与上半身构图互斥');
  if(/\bfrom above\b/.test(normalized)&&/\bfrom below\b/.test(normalized))issues.push('俯视与仰视机位互斥');
  if(texts.length>1&&actualPeople!==texts.length-1)issues.push('base 人数必须等于角色段数量');
  return {prompt,issues:[...new Set(issues)],stats:{total,tags,natural,tagPercent:Math.round(ratio*1000)/10}};
}
