// The converter emits a typed transport envelope; only its validated, ordered
// text is sent to NovelAI. These checks are not a universal semantic proof.
export function mixedTemplateContract(template:string,mode:string) {
  const range=template.match(/计数口径[^\n]*?(\d{1,3})\s*[–—-]\s*(\d{1,3})/) ?? template.match(/有效语义单元[\s\S]{0,80}?(\d{1,3})\s*[–—-]\s*(\d{1,3})/);
  if(mode!=='mixed'||!range||!/(?:65\s*[–—-]\s*75|70)\s*%/.test(template))return null;
  return {min:/极短输入允许\s*25\s*[–—-]\s*49/.test(template)?25:Number(range[1]),max:Number(range[2]),tagMin:.65,tagMax:.75};
}
export const mixedEnvelopeInstruction=`软件内部输出协议（不改变上文最终提示词的内容要求）：返回 JSON 对象 {"segments":[{"units":[{"kind":"tag","text":"1girl"},{"kind":"natural","text":"her left hand rests on the railing"}]}]}。每个 units 项恰好是一个有效单元（通常无逗号；引号内画面文字允许逗号和中文，不能拆开）。单人一个 segment；多人 base 与角色段各一个 segment，角色段开头使用 girl/boy/other。kind 只能 tag 或 natural。成熟 Tag 用 tag；位置、身体侧、关系、层次的自然短语用 natural，不要把短 Tag 假标 natural 或把完整句子标 tag。最终由软件按逗号、段间竖线拼接，用户和生图接口只收到纯提示词，不收到 JSON。
先遵守不虚构和短输入例外，再规划数量：信息充分的普通单人建议 60 个不重复单元（42 Tag + 18 自然短语），不是恰好卡在下限。保持所选模板的上下限与比例。自然短语增加明确关系，不重复 Tag。原始用户要求高于 Agent 转述和历史助手补写；旧约束只在新消息明确改变时更新。不改变已指定发色、瞳色、人数、场景、镜头；不要为了凑数新增关键衣服、人物或情节。`;

export function patchMixedEnvelope(previous:string,raw:string){
  const envelope=JSON.parse(previous),patch=JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(!patch||Object.keys(patch).some(k=>!['replace','append','remove'].includes(k)))throw Error('校正需要 replace/append/remove 增量，不能重写整条提示词');
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

// Remove only byte-equivalent units modulo spacing/case/Tag underscores. Keep
// segment ownership, kind and weighting; never pad counts or rewrite a fact.
export function normalizeMixedEnvelope(raw:string):string {
  const envelope=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(!Array.isArray(envelope?.segments))return JSON.stringify(envelope);
  for(const segment of envelope.segments){
    if(!Array.isArray(segment?.units))continue;
    const seen=new Set<string>();
    segment.units=segment.units.filter((unit:any)=>{
      if(!['tag','natural'].includes(unit?.kind)||typeof unit.text!=='string')return true;
      const key=unit.kind+'\n'+unit.text.trim().toLowerCase().replaceAll('_',' ').replace(/\s+/g,' ');
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  return JSON.stringify(envelope);
}

export function auditMixedEnvelope(raw:string,source:string,contract:NonNullable<ReturnType<typeof mixedTemplateContract>>,options:{allowStyleTags?:boolean}={}) {
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
      const text=unit.text.trim(),plain=text.toLowerCase().replaceAll('_',' ').replace(/\d+(?:\.\d+)?::|::/g,'').replace(/\s+/g,' ').trim();
      const syntax=text.replace(/"[^"\r\n]*"|「[^」\r\n]*」/g,'"text"').replace(/^Text:\s*[^|\r\n]*$/i,'Text: text');
      if(/[,，|\r\n]/.test(syntax))issues.push(`segments[${index}].units[${unitIndex}] 每个单元不可含逗号或分段符：${text}`);
      if(/[\u4e00-\u9fff]/.test(syntax))issues.push('提示词只能包含英文');
      if(seen.has(plain))issues.push(`segments[${index}].units[${unitIndex}] 重复单元：${text}（删除此索引，保留第一次出现）`);seen.add(plain);
      if(!options.allowStyleTags&&/artist:|\b(?:masterpiece|best quality|amazing quality|very aesthetic)\b/.test(plain))issues.push('场景转换不应添加画师或质量词：'+text);
      if(unit.kind==='tag'){
        tags++;
        if(/\b(?:her|his|their|she|he|they|which|while|beneath|behind her|in front of|with (?:one|both|her|his)|on (?:her|his|the))\b/.test(plain)||plain.split(' ').length>6)issues.push('自然关系短语被标成 Tag：'+text);
      }else{
        natural++;localNatural++;
        if(plain.split(' ').length<4&&!/^(?:on the (?:left|right)|in the (?:middle|center))$/.test(plain))issues.push('短 Tag 被标成自然语言：'+text);
      }
      units.push(text);total++;
    }
    if(envelope.segments.length>1&&index>0){
      if(!/^(girl|boy|other)\b/i.test(units[0]))issues.push('角色段必须以 girl/boy/other 开头');
      if(!localNatural)issues.push('每个角色段需要至少一个位置或关系短语');
    }
    texts.push(units.join(', '));
  }
  const prompt=texts.join(' | '),normalized=prompt.toLowerCase().replaceAll('_',' '),ratio=tags/Math.max(1,total);
  if(total<contract.min||total>contract.max)issues.push(`有效单元 ${total}，要求 ${contract.min}–${contract.max}`);
  if(ratio<contract.tagMin||ratio>contract.tagMax)issues.push(`Tag ${tags}/${total}（${(ratio*100).toFixed(1)}%），应为65–75%；自然语言应为25–35%`);
  // Preserve common explicit single-character facts; multi-character associations
  // remain in their segments rather than imposing one hair color on all people.
  if(envelope.segments.length===1){
    const colors:Record<string,string[]>={'白':['white'],'银':['silver'],'银白':['silver','white'],'黑':['black'],'红':['red'],'蓝':['blue'],'金':['blonde','blond'],'紫':['purple'],'棕':['brown']};
    for(const [part,pattern] of [['hair',/(银白|白|银|黑|红|蓝|金|紫|棕)(?:色)?(?:长|短)?发|\b(white|silver|black|red|blue|blonde|purple|brown) hair\b/gi],['eyes',/(白|银|黑|红|蓝|金|紫|棕)(?:色)?(?:眼睛|眼|瞳)|\b(white|silver|black|red|blue|golden|purple|brown) eyes\b/gi]] as const){
      const matches=[...source.matchAll(pattern)],last=matches.at(-1);
      if(last){const allowed=colors[last[1]]??[last[2]?.toLowerCase()];
        const actual=[...normalized.matchAll(new RegExp('\\b(white|silver|black|red|blue|blonde|blond|golden|purple|brown) '+part+'\\b','g'))].map(x=>x[1]);
        if(!actual.some(x=>allowed.includes(x))||actual.some(x=>!allowed.includes(x)))issues.push(`用户指定 ${allowed.join('/')} ${part}，不可遗漏或替换`);
      }
    }
  }
  if(/单人|一位|一个(?:女孩|少女|女性)|\bsolo\b/.test(source)&&(!/\b1girl\b|\b1boy\b|\b1other\b/.test(normalized)||/\b[2-9](?:girls|boys|others)\b/.test(normalized)||texts.length>1))issues.push('保留用户指定的单人数量');
  const latestTime=[...source.matchAll(/雨夜|雨天|傍晚|黄昏|日落|夕阳|白天|清晨|黎明|rainy night|sunset|daytime/gi)].at(-1)?.[0];
  if(/^(?:雨夜|rainy night)$/i.test(latestTime??'')&&(!/\brain\b|\brainy\b/.test(normalized)||!/\bnight\b/.test(normalized)||/\bdaytime\b|\bsunset\b/.test(normalized)))issues.push('保留雨夜，不替换成白天或日落');
  if(/透明.*(?:伞)|transparent umbrella/i.test(source)&&!/\btransparent umbrella\b/.test(normalized))issues.push('保留透明雨伞');
  const latestCamera=[...source.matchAll(/俯视(?:机位|视角|镜头)|仰视(?:机位|视角|镜头)|平视(?:机位|视角|镜头)|from above|from below|eye level/gi)].at(-1)?.[0];
  if(/俯视|from above/i.test(latestCamera??'')&&(!/\bfrom above\b/.test(normalized)||/\bfrom below\b|\blow angle\b/.test(normalized)))issues.push('保留俯视机位 from above，不混入仰视机位');
  const latestFraming=[...source.matchAll(/全身|上半身|半身|特写|full body|upper body|close.up/gi)].at(-1)?.[0];
  if(/全身|full body/i.test(latestFraming??'')&&(!/\bfull body\b/.test(normalized)||/\bupper body\b/.test(normalized)))issues.push('保留全身构图，不替换成上半身');
  if(/上半身|半身|upper body/i.test(latestFraming??'')){
    if(!/\bupper body\b/.test(normalized)||/\bfull body\b/.test(normalized))issues.push('保留上半身构图 upper body，不替换成全身');
    if(!/脚|鞋|靴|腿|膝|\b(?:feet|shoes|boots|legs|knees)\b/i.test(source)&&/\b(?:both feet|her feet|his feet|long legs|full figure|head to toe|knees visible|shoes|boots|footwear|sandals|sneakers|high heels)\b/.test(normalized))issues.push('上半身构图不应补入展示双脚、长腿或全身的提示；删除未要求的取景冲突，保留明确衣着');
  }
  if(/\bupper body\b/.test(normalized)&&/\bfull body\b/.test(normalized))issues.push('全身与上半身构图互斥');
  if(/\bfrom above\b/.test(normalized)&&/\bfrom below\b/.test(normalized))issues.push('俯视与仰视机位互斥');
  if(texts.length>1){const counts=[...texts[0].matchAll(/\b(\d+)(?:girls?|boys?|others?)\b/g)].reduce((n,m)=>n+Number(m[1]),0);if(counts!==texts.length-1)issues.push('base 人数必须等于角色段数量');}
  return {prompt,issues:[...new Set(issues)],stats:{total,tags,natural,tagPercent:Math.round(ratio*1000)/10}};
}
