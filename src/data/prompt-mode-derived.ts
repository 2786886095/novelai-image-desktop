export type DerivedPromptMode = 'tags' | 'natural' | 'mixed';

// Format-only derivation. The source mixed template remains byte-for-byte saved.
// Scope, evidence, ownership, exclusions, text and model-version rules survive.
export function derivePromptModeTemplate(mixed: string, mode: DerivedPromptMode): string {
 if (mode === 'mixed') return mixed;
 // Strip only format ratios: never discard co-located evidence or ownership rules.
 const ratio = /(?:Danbooru\s*(?:\/\s*NovelAI\s*)?Tag|NovelAI\s*Tag|Tag|自然语言)\s*(?:保持|占|比例)?\s*(?:约)?\s*\d+(?:\s*[–—-]\s*\d+)?\s*[%％]|(?:约\s*)?\d+(?:\s*[–—-]\s*\d+)?\s*[%％]\s*(?:(?:英文|简短|简洁)\s*)*(?:Danbooru\s*(?:\/\s*NovelAI\s*)?Tag|NovelAI\s*Tag|Tag|自然语言)/gi;
 const source = mixed.split('\n').map(line=>{
  const stripped=line.replace(ratio,'').replace(/「[\s+＋]*」的混合提示词/g,(mode==='tags'?'纯 Tag':'纯自然语言')+'提示词');
  if(/^[\s+＋，,；;。.\[\]x]*$/i.test(stripped)||/^\s*prompt\s+使用[\s+＋，,；;。.]*$/i.test(stripped))return '';
  return stripped.replace(/^(\s*(?:\[[ x]\]\s*)?)[，,；;]+\s*/i,'$1');
 }).join('\n').trimEnd();
 const format = mode === 'tags'
  ? '当前模式：纯 Tag（从同任务混合模板派生）。\n只输出英文逗号分隔的 Danbooru / NovelAI Tag，不输出自然语言句子，不要求混合比例。原模板的有效语义单元范围在本模式按有效 Tag 计数，保留其事实不足例外，不用同义词或虚构细节凑数。将已有动作、空间、哪只手、注视目标及光源关系转为准确 Tag 或最短必要属性词组，不得直接删掉这些事实。没有可靠 Tag 时保留最短准确词组，不捏造成熟 Tag。多人仍按 base | girl/boy/other 分段；互动锚点、权重与文字载荷遵循所选模型版本。关键交互的 source#/target# 成对，例如 source#giving/target#giving；不得留下孤立锚点。仅在明确相互牵手时，各参与者写 mutual#holding hands。已有权重保持闭合，例如 1.2::tag ::。'
  : '当前模式：纯自然语言（从同任务混合模板派生）。\n只输出简洁英文自然语言提示词，不输出逗号堆叠的 Tag 列表，不要求 Tag 数量、逗号单元总数或混合比例。篇幅以完整表达已有事实为准，不能把精简等同于删除细节。保留人数、身份、外貌、服装、道具归属、身体侧、动作方向、取景、层次、遮挡及光源。将原模板的 source#/target#/mutual# 等互动规则转为明确施受关系的英文表达；不用动作锚点或 Tag 加权写法替代正文。多人仍按原角色顺序与归属分段。仅为所选模型需要的 dataset、透明背景、text、语言与 Text: 保留控制标记；渲染文字保持原文和载体；采用 text, <language> text 与 Text:，正文不复述文字内容。';
 const safeguards='\n同一层级互斥项必须排除；base 全局取景与角色局部朝向、回头或注视不视为互斥。人数上限遵循所选模型和原模板，不因派生模式放宽。'+(/NovelAI (?:Diffusion )?V5/.test(mixed)?'V5 Full 最多 22 个角色段，base 人数与角色段一致。':'');
 return source+safeguards + '\n\n【格式覆写：本模式覆盖上文混合专用的表达、数量与比例规则；其余内容约束不变】\n' + format;
}
