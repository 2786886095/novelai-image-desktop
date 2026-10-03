import {auditMixedEnvelope, mixedEnvelopeInstruction, mixedTemplateContract,normalizeMixedEnvelope} from './prompt-template-audit';

/** Count each variant independently; character identity is not an exemption. */
export function reverseTemplateProtocol(template:string, mode:string, knownCharacter:boolean, task:'reverse'|'convert'='reverse') {
  const tagRange=mode==='tags'?(template.match(/计数口径[^\n]*?(\d{1,3})\s*[–—-]\s*(\d{1,3})/)??template.match(/有效语义单元[\s\S]{0,80}?(\d{1,3})\s*[–—-]\s*(\d{1,3})/)):null;
  const tagOnly=!!tagRange;
  const contract=tagRange?{min:Number(tagRange[1]),max:Number(tagRange[2]),tagMin:1,tagMax:1}:mixedTemplateContract(template,mode);
  if(!contract)return null;
  return {
    instruction: (tagOnly?`软件内部 JSON 输出协议：返回 {"segments":[{"units":[{"kind":"tag","text":"1girl"}]}]}，所有单元的kind为tag。每项是一个不含逗号的准确Tag或最短必要属性词组。最终由软件拼接成纯Tag文本，不把JSON给用户。单人严格只有一个 segment，人数、外貌、衣着与场景均在同一个units中，不拆为base加girl段；仅多人base与角色各一个segment。严格满足所选模板的${contract.min}–${contract.max}个不重复有效Tag；信息充分时先规划60个再输出。独立属性可分别用成熟Tag表达，如long hair与black hair分别描述长度和颜色；不堆同义词、不拆碎句子凑数。`:mixedEnvelopeInstruction) + (task==='convert'?'\n这是文本转换，不是图片反推。遵从所选模板与原始用户要求：只有模板允许扩写且用户未禁止时，未限定的次要细节可以合理补充（光线、材质、构图），但不能改变人数、身份、明确外貌、关键服装、动作关系和场景。用户要求严格不扩写时不为计数目标编造；无法同时满足时拒绝结果。':'\n反推只使用图像可见证据和用户指定范围，不为凑数杜撰细节。角色 Tag 不替代可见构图、姿势、道具、环境关系。') +
      (task==='reverse'?'\n可见证据边界：光照不等于可见光源。太阳圆盘不可见时不写 sun；可见受光山坡可保留 sunlight/alpenglow 等实际光照，不能推定画外物体。无法确认日出或日落时不指定 morning/sunrise/sunset，仅描述可见的暖光、色彩和阴影。地貌与材质词不以同义项重复计数，rock/stone 仅一个有效单元；保留 stone floor 等不同限定事实。foreground/background 等空泛层级词不能代替具体可见物体及其位置。信息不足达到模板下限时保留不确定性，不用太阳、时间或材质近义词凑数。':'')+
      (knownCharacter ? '\n本次内部协议覆盖前文的字符串 JSON 协议：返回 {"namePrompt":{"segments":[{"units":[]}]},"featurePrompt":{"segments":[{"units":[]}]}}。两个字段均为完整 envelope，各自独立满足所选模板；不要把一个版本缩减成短标签列表。' : ''),
    parse(raw:string,source='') {
      const value=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
      const audit=(envelope:unknown)=>{
        // Visual facts are supplied by the image, not inferred from the UI's help text.
        const result=auditMixedEnvelope(normalizeMixedEnvelope(JSON.stringify(envelope)),source,contract,
          {tagOnly,allowStyleTags:!/(?:不输出|无)[^\n]{0,30}(?:画师|画质|质量)/.test(template)});
        if(result.issues.length)throw Error(result.issues.join('；'));
        return result.prompt;
      };
      if(!knownCharacter)return {prompt:audit(value),variants:undefined};
      const namePrompt=audit(value.namePrompt),featurePrompt=audit(value.featurePrompt);
      return {prompt:namePrompt,variants:{namePrompt,featurePrompt}};
    }
  };
}
