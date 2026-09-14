import {describe,expect,it} from 'vitest';
import {tavernUiText} from './tavern/ui-i18n';
import {imageOutcomeText} from './agent/image-outcome';

describe('concise user-facing status copy',()=>{
  it('states that the original image is unavailable without implementation promises',()=>{
    expect(tavernUiText('zh-CN','imageUnavailable')).toBe('原图已失效');
    expect(tavernUiText('en-US','imageUnavailable')).toBe('Original image unavailable');
  });
  it('retains actionable failure and timing information in every language',()=>{
    for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){
      const text=imageOutcomeText(language);
      expect(text.proposalTitle).not.toBe(text.generationTitle);
      expect(text.repairPending).toContain('45');
      expect(text.missing.length).toBeGreaterThan(5);
      expect(tavernUiText(language,'userConfirmHint')).toContain('Anlas');
      expect(tavernUiText(language,'userPromptHint').length).toBeGreaterThan(3);
    }
    expect(imageOutcomeText('zh-CN').missing).toBe('未收到生图方案，请重新生成回复。');
    expect(imageOutcomeText('zh-CN').empty).toBe('未收到图片，请重试生成。');
  });
});
