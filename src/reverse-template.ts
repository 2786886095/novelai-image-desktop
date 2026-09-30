import {auditMixedEnvelope, mixedEnvelopeInstruction, mixedTemplateContract,normalizeMixedEnvelope} from './prompt-template-audit';

/** Count each variant independently; character identity is not an exemption. */
export function reverseTemplateProtocol(template:string, mode:string, knownCharacter:boolean) {
  const contract=mixedTemplateContract(template,mode);
  if(!contract)return null;
  return {
    instruction: mixedEnvelopeInstruction + '\n反推只使用图像可见证据和用户指定范围，不为凑数杜撰细节。角色 Tag 不替代可见构图、姿势、道具、环境关系。' +
      (knownCharacter ? '\n本次内部协议覆盖前文的字符串 JSON 协议：返回 {"namePrompt":{"segments":[{"units":[]}]},"featurePrompt":{"segments":[{"units":[]}]}}。两个字段均为完整 envelope，各自独立满足所选模板；不要把一个版本缩减成短标签列表。' : ''),
    parse(raw:string) {
      const value=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
      const audit=(envelope:unknown)=>{
        // Visual facts are supplied by the image, not inferred from the UI's help text.
        const result=auditMixedEnvelope(normalizeMixedEnvelope(JSON.stringify(envelope)),'',contract,
          {allowStyleTags:!/(?:不输出|无)[^\n]{0,30}(?:画师|画质|质量)/.test(template)});
        if(result.issues.length)throw Error(result.issues.join('；'));
        return result.prompt;
      };
      if(!knownCharacter)return {prompt:audit(value),variants:undefined};
      const namePrompt=audit(value.namePrompt),featurePrompt=audit(value.featurePrompt);
      return {prompt:namePrompt,variants:{namePrompt,featurePrompt}};
    }
  };
}
