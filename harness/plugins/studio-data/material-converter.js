const kinds={characters:['character','rpCharacterCards','card'],personas:['persona','rpPersonas','persona'],lorebooks:['lorebook','rpLoreBooks','lorebooks'],samplerPresets:['preset','rpPresets','preset']};
export {kinds};
export function convertMaterial(collection,item,normalizeLoreBook){
 if(!kinds[collection]||!item||typeof item.name!=='string'||!item.name.trim())throw Error('资料分类或名称无效');
 const warnings=['使用本机资料的酒馆副本，不覆盖原资料；头像与生图设置不随文本绑定。'];
 const copy=keys=>Object.fromEntries(keys.filter(k=>item[k]!==undefined).map(k=>[k,item[k]]));
 let value;
 if(collection==='characters'){
  value=copy(['name','description','personality','scenario','firstMessage','creatorNotes','tags','alternateGreetings']);
  value.messageExample=item.exampleMessages??'';
  if(item.systemPrompt||item.postHistoryInstructions)warnings.push('角色系统提示词和历史后指令保留在原库，本次不注入；请在酒馆预设中单独配置。');
 }else if(collection==='personas'){
  value=copy(['name','description']);warnings.push('人设库为空时，官方插件会把第一个人设设为默认人设。');
 }else if(collection==='samplerPresets'){
  value={name:item.name,description:'来自 Studio 本机酒馆预设的提示词部分',fields:[]};
  if(item.systemPrompt)value.fields.push({name:'系统提示词',description:'Studio 导入',content:item.systemPrompt,position:'top',sectionTag:false});
  if(item.jailbreakPrompt)value.fields.push({name:'追加提示词',description:'Studio 导入',content:item.jailbreakPrompt,position:'bottom',sectionTag:false});
  warnings.push('只应用预设的提示词；温度、Top P、输出上限、惩罚和停止词不更改当前模型设置。');
 }else{
  if(!Array.isArray(item.entries))throw Error('世界书条目不完整');
  const positions={'before-character':'before_char','after-character':'after_char','before-examples':'before_examples','after-examples':'after_examples',depth:'in_chat'};
  const raw=item.entries.map((e,i)=>{
   if(typeof e.content!=='string'||!e.content.trim())throw Error(`世界书第 ${i+1} 项正文为空，请在本机资料库修正`);
   if(!positions[e.position])throw Error(`世界书第 ${i+1} 项插入位置无效`);
   return {id:e.id??String(i),name:e.comment||`条目 ${i+1}`,content:e.content,keys:e.keys??[],secondary_keys:e.selective?e.secondaryKeys??[]:[],selective:e.selective===true,constant:e.constant===true,enabled:e.enabled!==false,case_sensitive:e.caseSensitive===true,position:positions[e.position],insertion_order:e.insertionOrder??100,extensions:{depth:e.depth??0,recursive:item.recursiveScanning===true}};
  });
  // Use the owning plugin's importer normalization rather than guessing its levels/order.
  const normalized=normalizeLoreBook({name:item.name,entries:raw},'studio-material');
  if(normalized.entries.length!==raw.length)throw Error('世界书转换丢失条目，未写入');
  const fields=['id','name','level','content','keys','secondaryKeys','constant','enabled','caseSensitive','recursive','order','position','insertionPosition','depth','probability'];
  value={name:item.name,entries:normalized.entries.map(e=>Object.fromEntries(fields.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])))};
  warnings.push('世界书按官方插件规则归入上下文分区；扫描深度、Token 预算使用酒馆当前设置。');
 }
 return {kind:kinds[collection][0],service:kinds[collection][1],slot:kinds[collection][2],value,warnings};
}
