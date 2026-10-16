import { describe, expect, it } from 'vitest';
import { reverseTemplateProtocol } from './reverse-template';

const template = '计数口径：1–3 个有效 Tag';
const envelope = { segments: [{ units: [{ kind: 'tag', text: '1girl' }] }] };
const json = JSON.stringify(envelope);
const parse = (raw: string) => reverseTemplateProtocol(template, 'tags', false)!.parse(raw);

describe('strict reverse-template JSON transport wrappers', () => {
  it.each([
    json,
    `\`\`\`json\n${json}\n\`\`\``,
    ` \`\`\`JSON\r\n${json}\r\n\`\`\` `,
    `\`\`\`\n${json}\n\`\`\``,
    `json ${json}`,
    `json\n${json}`,
  ])('accepts a complete document or bounded wrapper: %s', (raw) => {
    expect(parse(raw).prompt).toBe('1girl');
  });

  it.each([
    json.slice(0, -1),
    `${json} ${json}`,
    `${json} trailing`,
    `Here is the JSON: ${json}`,
    `prefix ${json} suffix`,
    `\`\`\`json\n${json}`,
    `\`\`\`json\n${json}\n\`\`\` trailing`,
    `\`\`\`javascript\n${json}\n\`\`\``,
    `json prose ${json}`,
  ])('rejects truncated, concatenated, prose or garbage transport: %s', (raw) => {
    expect(() => parse(raw)).toThrow();
  });

  it('does not broaden the envelope schema to arrays', () => {
    expect(() => parse(`json ${JSON.stringify([envelope])}`)).toThrow(/有效段落/);
  });

  it('preserves quoted comma text as one literal unit', () => {
    const raw = JSON.stringify({ segments: [{ units: [{ kind: 'tag', text: 'Text: "Sorry, Mom"' }] }] });
    expect(parse(`\`\`\`json\n${raw}\n\`\`\``).prompt).toBe('Text: "Sorry, Mom"');
  });

  it('keeps the known-character two-envelope contract', () => {
    const raw = JSON.stringify({ namePrompt: envelope, featurePrompt: envelope });
    const result = reverseTemplateProtocol(template, 'tags', true)!.parse(`json ${raw}`);
    expect(result.variants).toEqual({ namePrompt: '1girl', featurePrompt: '1girl' });
  });
});
