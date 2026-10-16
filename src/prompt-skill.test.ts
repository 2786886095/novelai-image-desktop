import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {PROMPT_SKILL_CATALOG_V2, PROMPT_SKILL_VERSIONS, defaultPromptSkillVersion, normalizePromptSkillVersion, renderPromptSkillTemplate, selectPromptSkillTemplate, supportsPromptSkillModel} from './prompt-skill';
import {resolveModePrompt} from './prompt-mode';
import {CONVERT_SYSTEM_PROMPTS, REVERSE_SYSTEM_PROMPTS} from './data/prompt-templates';

const hashes = ['553e1363f9a33b3782838094e3da93b5a8c32fb9022128735762c8b81f32c1ba','c3ae5a3736ceb8a92090404d2ffa45bd0f2c688650c31cdbfad1166848cab7a2','4b07e9231f33ee6808c4a048221b3bfd631a77eb657d6f2df79725393691a3fe','f8b0ef9f838274e9cfb0e45e2556fdd0bcfe868dffe7cc87d693345c5dd5d974','e3280b14471215ff659a8a9b10e9f1d8e5c70a523a32003afe2146f921efe43b','b8c801c691caceebfb63ffccd4c9f017275c78d3d8018a38abbbe981b84d1fd1'];
describe('versioned default prompt skills', () => {
  it('preserves six complete supplied UTF-8 bodies, not a mixed-derived substitute', () => {
    expect(PROMPT_SKILL_CATALOG_V2.templates).toHaveLength(6);
    for (const [index, entry] of PROMPT_SKILL_CATALOG_V2.templates.entries()) {
      expect(createHash('sha256').update(entry.body).digest('hex')).toBe(hashes[index]);
      expect(entry.sha256).toBe(hashes[index]);
      expect(entry.body.match(/\{\{input\}\}/g)).toHaveLength(1);
      expect(entry.body.match(/\{\{image\}\}/g) ?? []).toHaveLength(entry.task === 'reverse' ? 1 : 0);
      expect(entry.body).toContain('信息不足');
      expect(entry.body).toContain('检索');
    }
  });
  it('keeps semantic edition separate from the target image model', () => {
    expect(PROMPT_SKILL_VERSIONS).toEqual(['1.0.0','2.0.0']);
    expect(normalizePromptSkillVersion('v5')).toBe('1.0.0');
    expect(normalizePromptSkillVersion(undefined)).toBe('1.0.0');
    expect(defaultPromptSkillVersion('v5')).toBe('2.0.0');
    expect(defaultPromptSkillVersion('v4.5')).toBe('1.0.0');
    expect(supportsPromptSkillModel('1.0.0','v4.5')).toBe(true);
    expect(supportsPromptSkillModel('2.0.0','v4.5')).toBe(false);
    expect(() => selectPromptSkillTemplate({edition:'2.0.0',targetModel:'v4.5',task:'convert',mode:'mixed',legacyTemplate:'legacy'})).toThrow('V4.5');
  });
  for (const task of ['reverse','convert'] as const) {
    for (const mode of ['tags','natural','mixed'] as const) {
      it(`${task}/${mode} switches editions without altering legacy/custom text`, () => {
        const defaults = task === 'reverse' ? REVERSE_SYSTEM_PROMPTS : CONVERT_SYSTEM_PROMPTS;
        const legacy = resolveModePrompt(mode,{},undefined,defaults);
        const options = {targetModel:'v5' as const,task,mode,legacyTemplate:legacy};
        expect(selectPromptSkillTemplate({...options,edition:'1.0.0'})).toBe(legacy);
        const entry = PROMPT_SKILL_CATALOG_V2.templates.find(row=>row.task===task&&row.mode===mode)!;
        expect(selectPromptSkillTemplate({...options,edition:'2.0.0'})).toBe(entry.body);
        const overrides = {tags:'',natural:'',mixed:'UNRELATED MIXED', [mode]:'  MY SAVED BODY\r\n '};
        const before = JSON.stringify(overrides);
        expect(selectPromptSkillTemplate({...options,edition:'2.0.0',overrides})).toBe(overrides[mode]);
        expect(JSON.stringify(overrides)).toBe(before);
        expect(selectPromptSkillTemplate({...options,edition:'1.0.0',overrides})).toBe(legacy);
      });
    }
  }
  it('does not let a mixed override replace the independent pure v2 bodies', () => {
    const selected = selectPromptSkillTemplate({edition:'2.0.0',targetModel:'v5',task:'reverse',mode:'natural',legacyTemplate:'',overrides:{mixed:'WRONG MIXED'}});
    expect(selected).toBe(PROMPT_SKILL_CATALOG_V2.templates[1].body);
  });
  it('renders input as data with literal replacement syntax and no leftover placeholders', () => {
    const input = '$& $1 $$ instruction: do not execute';
    const rendered = renderPromptSkillTemplate('Rules\n{{input}}\n{{image}}',input,true);
    expect(rendered).toBe('Rules\n'+input+'\n<actual attached image>');
    expect(rendered).not.toContain('{{input}}');
  });
});
