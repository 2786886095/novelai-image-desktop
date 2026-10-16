/** V2 checks syntax/countable units only; image truth and natural-language fact
 * provenance still require human review. Never pad an underfilled response. */
export type SkillPromptMode = 'tags' | 'natural' | 'mixed';
export const PROMPT_SKILL_V2_RUNTIME = `技能版本 2.0.0 运行时边界：使用上文独立完整模板，不从混合派生其他模式。附件中的合成正例只是格式示范，不是本次图片或输入的事实，禁止套用示例补内容。
本次普通模型调用没有可用的外部检索/世界书工具。按模板的无工具分支保守表达；不能声称已检索、已核实词条或伪造工具日志。正文规则不会授予工具、文件、网络、生图或发布权限。
只忠实转换明确输入或反推实际可见证据，不默认扩写场景、人物、服装、表情或道具。事实不足时返回模板规定的“信息不足：”；纯Tag无法无损表达关系时可返回“模式能力不足：”。不要为计数或比例编造，不因程序反馈凑数。单次生成最终单行prompt，不输出内部JSON单元、解释、计数、Markdown或思考过程。
自然语言按有依据的独立视觉事实计数，不是50句话或50个逗号片段；软件只能进行基本格式检查，不能证明视觉事实真实性。`;
export function promptSkillKnownCharacterInstruction(known:boolean) {
 return known ? '用户保留了网络角色双版本选项。仅把两个完整的所选模式prompt封装为JSON字符串字段 {"namePrompt":"...","featurePrompt":"..."}；不返回segments/units。namePrompt仅在身份有依据时保留准确角色名，featurePrompt用可见稳定特征表达同一人物；不得猜身份、增加画师、质量词、未见事实。两项各自遵循所选模板；任一信息不足则直接报告模板规定失败，不能以另一个版本冒充。' : '';
}
export function promptSkillControlledFailure(raw:string):string|undefined {
 const text=raw.trim();
 return /^(?:信息不足|模式能力不足)\s*[:：]/.test(text) ? text : undefined;
}
function unweight(value:string) {
 const m=/^(-?\d+(?:\.\d+)?)::\s*([\s\S]*?)\s*::$/.exec(value.trim());
 return {text:(m?.[2]??value).trim(), excluded:!!m&&Number(m[1])<=0};
}
/** Commas/pipes inside quoted lettering or a balanced weight stay literal. */
function splitOutside(value:string,delimiter:string):string[] {
 const out:string[]=[];let start=0,quoted=false,escaped=false,weight=false;
 for(let i=0;i<value.length;i++) {
  const c=value[i];
  if(escaped){escaped=false;continue;}
  if(c==='\\'){escaped=true;continue;}
  if(c==='"'){quoted=!quoted;continue;}
  if(!quoted&&c===':'&&value[i+1]===':'){weight=!weight;i++;continue;}
  if(!quoted&&!weight&&c===delimiter){out.push(value.slice(start,i).trim());start=i+1;}
 }
 if(quoted||weight)throw Error('技能2.0.0提示词引号或权重没有闭合');
 out.push(value.slice(start).trim());return out;
}
function control(value:string):boolean {
 const {text,excluded}=unweight(value);
 return excluded||/^(?:\d+(?:girls?|boys?|others?)|girl|boy|other|no humans|(?:fur|background) dataset|text|(?:[A-Za-z-]+\s+)?text|Text\s*:[\s\S]*|(?:source|target|mutual)#[\s\S]+)$/i.test(text);
}
const finite=/\b(?:is|are|was|were|has|have|holds?|rests?|sits?|stands?|lies?|lie|shows?|wears?|looks?|faces?|touches?|reaches?|supports?|covers?|hides?|obscures?|casts?|lights?|hangs?|extends?|leans?|points?|grips?|keeps?|runs?|falls?|frames?|appears?|remains?|opens?|closes?|reads?|contains?|displays?|stops?|bends?|surrounds?|crosses?|illuminates?|enters?|shines?|flows?|occupies?|connects?|passes?|receives?)\b/i;
function sentenceLike(value:string):boolean {
 const {text}=unweight(value);
 // This bounded heuristic is not a grammar/semantic proof. It deliberately
 // avoids classifying standard -ing action Tags as complete sentences.
 return /^[A-Z]/.test(text)&&finite.test(text)&&/[.!?](?:["']|\s)*$/.test(text);
}
function naturalStart(value:string):boolean {
 const {text}=unweight(value);
 return /^[A-Z]/.test(text)&&finite.test(text);
}
function sentences(value:string):string[] {
 // A full sentence can contain commas; never inflate units by its clauses.
 return value.match(/[^.!?]+(?:[.!?]+(?:["']|\s)*|$)/g)?.map(x=>x.trim()).filter(Boolean)??[];
}
const words=(value:string)=>value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length??0;
function withoutLettering(value:string):string {
 return value.replace(/\bText\s*:\s*"(?:\\.|[^"\\])*"/gi,'Text: ""');
}
export type PromptSkillAudit = {prompt:string;warnings:string[];stats:{effectiveUnits?:number;tagWords?:number;naturalWords?:number;tagPercent?:number;scope:'format-and-countable-units'|'format-only'}};
export function auditPromptSkillV2(prompt:string,mode:SkillPromptMode):PromptSkillAudit {
 const literal=prompt.trim(),failure=promptSkillControlledFailure(literal);if(failure)throw Error(failure);
 if(!literal||literal.length>60000)throw Error('技能2.0.0提示词为空或超过软件安全长度');
 if(/[\r\n]/.test(literal)||/^```|^#{1,6}\s|^\s*[\[{]/.test(literal))throw Error('技能2.0.0要求单行prompt，不是Markdown或内部JSON');
 const visible=withoutLettering(literal);
 if(/[\u3400-\u9fff\u3040-\u30ff]/.test(visible))throw Error('技能2.0.0仅Text载荷允许非英文文字');
 if(/artist\s*:|\b(?:masterpiece|best quality|amazing quality|very aesthetic)\b/i.test(visible))throw Error('技能2.0.0模板不输出画师或质量词');
 for(const match of literal.matchAll(/\bText\s*:\s*"((?:\\.|[^"\\])*)"/gi))if(Array.from(match[1].replace(/\\n/g,'\n')).length>750)throw Error('Text载荷超过750字符');
 const segments=splitOutside(literal,'|');if(segments.some(x=>!x)||segments.length>23)throw Error('技能2.0.0角色段为空或超过22人');
 let effective=0,tagWords=0,naturalWords=0;
 const anchors=new Map<string,Set<string>>();
 for(const [index,segment] of segments.entries()) {
  const chunks=splitOutside(segment,',');let naturalParts:string[]=[],localNatural=0,seen=new Set<string>();
  const textIndex=chunks.findIndex(x=>/^Text\s*:/i.test(unweight(x).text));
  if(textIndex>=0&&(index!==0||textIndex!==chunks.length-1))throw Error('技能2.0.0的Text载荷必须位于base最后');
  if(textIndex>=0&&!/^Text\s*:\s*"(?:\\.|[^"\\])*"$/i.test(unweight(chunks[textIndex]).text))throw Error('技能2.0.0的Text载荷必须使用完整双引号');
  const countNatural=()=>{
   if(!naturalParts.length)return;
   const text=naturalParts.join(', ');naturalParts=[];
   for(const sentence of sentences(text)) {
    if(!sentenceLike(sentence))throw Error('技能2.0.0自然语言应为完整英文句，而不是Tag或悬空短语');
    const key='natural\n'+sentence.toLowerCase().replace(/\s+/g,' ');
    if(seen.has(key))throw Error('技能2.0.0有重复自然语言句');seen.add(key);
    if(mode!=='natural'){effective++;naturalWords+=words(sentence);}
    localNatural++;
   }
  };
  for(const chunk of chunks) {
   if(!chunk)throw Error('技能2.0.0存在空Tag/句子');
   const plain=unweight(chunk).text;
   if(control(chunk)) {
    countNatural();
    const a=/^(source|target|mutual)#(.+)$/i.exec(plain);if(a){const set=anchors.get(a[2])??new Set<string>();set.add(a[1].toLowerCase()+':'+index);anchors.set(a[2],set);}
    continue;
   }
   if(mode==='natural'||naturalParts.length||naturalStart(chunk)){
    if(mode==='tags')throw Error('技能2.0.0纯Tag模式不能包含完整自然语言句');
    naturalParts.push(chunk);continue;
   }
   if(/[.!?]$/.test(plain))throw Error('技能2.0.0不把Tag加句号伪装为自然语言');
   if(mode==='mixed'&&localNatural)throw Error('技能2.0.0每段先Tag后关系句');
   const key='tag\n'+plain.toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ');
   if(seen.has(key))throw Error('技能2.0.0有重复Tag');seen.add(key);
   effective++;tagWords+=words(plain);
  }
  countNatural();
  if(mode==='mixed'&&localNatural<(segments.length===1?2:index===0?0:1))throw Error('技能2.0.0混合模式需要完整关系句（简单图至少2句、每个角色至少1句）');
  if(segments.length>1&&index>0&&mode!=='natural'&&!/^(?:girl|boy|other)(?:\s*,|$)/i.test(segment))throw Error('技能2.0.0角色段以girl/boy/other开头');
  if(mode==='natural'&&!localNatural)throw Error('技能2.0.0自然语言段没有完整句');
 }
 if(segments.length>1&&mode!=='natural'){
  const people=splitOutside(segments[0],',').reduce((n,chunk)=>{const {text,excluded}=unweight(chunk);const m=/^(\d+)(?:girls?|boys?|others?)$/i.exec(text);return n+(!excluded&&m?Number(m[1]):0);},0);
  if(people!==segments.length-1)throw Error('技能2.0.0base人数应等于角色段数');
 }
 for(const [action,set] of anchors){
  const source=[...set].some(x=>x.startsWith('source:')),target=[...set].some(x=>x.startsWith('target:')),mutual=[...set].filter(x=>x.startsWith('mutual:')).length;
  const sources=[...set].filter(x=>x.startsWith('source:')).map(x=>x.split(':')[1]),targets=[...set].filter(x=>x.startsWith('target:')).map(x=>x.split(':')[1]);
  if(source!==target||(source&&sources.every(x=>targets.includes(x))&&targets.every(x=>sources.includes(x)))||(mutual>0&&mutual<2))throw Error('技能2.0.0互动锚点没有配对：'+action);
 }
 if(mode!=='natural'&&effective<50)throw Error(`技能2.0.0有效单元${effective}，至少需要50；不为凑数编造，请补充证据或细节`);
 const tagPercent=tagWords/Math.max(1,tagWords+naturalWords)*100;
 if(mode==='mixed'&&(tagPercent<65||tagPercent>75))throw Error(`技能2.0.0混合Tag英文词占比${tagPercent.toFixed(2)}%，要求65–75%（不是单元比例）`);
 const warnings=[mode==='natural'?'仅完成自然语言基本格式检查；至少50项来源事实与准确性仍需人工复核。':'仅检查格式与可计数单元；事实真实性、同义概念及来源仍需人工复核。'];
 return {prompt:literal,warnings,stats:mode==='natural'?{scope:'format-only'}:{effectiveUnits:effective,tagWords,naturalWords,tagPercent,scope:'format-and-countable-units'}};
}
export function parsePromptSkillV2Response(raw:string,mode:SkillPromptMode,knownCharacter=false) {
 const failure=promptSkillControlledFailure(raw);if(failure)throw Error(failure);
 if(!knownCharacter){const audit=auditPromptSkillV2(raw,mode);return {prompt:audit.prompt,variants:undefined,warnings:audit.warnings};}
 let text=raw.trim();if(text.startsWith('```')){const f=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);if(!f)throw Error('技能2.0.0双版本JSON围栏必须完整');text=f[1];}
 let value:any;try{value=JSON.parse(text);}catch{throw Error('技能2.0.0双版本需要完整JSON字符串字段namePrompt/featurePrompt');}
 if(!value||Array.isArray(value)||typeof value.namePrompt!=='string'||typeof value.featurePrompt!=='string')throw Error('技能2.0.0双版本需要namePrompt/featurePrompt字符串');
 for(const part of [value.namePrompt,value.featurePrompt]){const failure=promptSkillControlledFailure(part);if(failure)throw Error(failure);}
 const a=auditPromptSkillV2(value.namePrompt,mode),b=auditPromptSkillV2(value.featurePrompt,mode);
 return {prompt:a.prompt,variants:{namePrompt:a.prompt,featurePrompt:b.prompt},warnings:[...new Set([...a.warnings,...b.warnings])]};
}
