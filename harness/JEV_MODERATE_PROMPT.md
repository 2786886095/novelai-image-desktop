# Jev 智能混合正面提示词

## Jev 可选开关
- 用户在智能提示词面板勾选或取消“启用 Jev 筛选”并保存。新用户默认关闭，已有用户选择保持不变。
- 开启：真实 Jev 评分；开启但缺少密钥、请求失败时提示错误，不擅自切换。
- 关闭：语言模型仍整理候选和关系，词典与本地结构检查、权重预算继续生效；不请求 Jev。所有评分、模型、用量返回 null，jevUsed=false。
- 关闭不删除密钥；每次新工具调用读取已保存设置。已发出的请求不会因随后关闭而撤回。
- 关闭只免去 Jev 调用费，不代表上游语言模型免费。

## 已确认的两条路径
- 文字输入：保持主体和原场景，适度补全适用的服装、视角、景别、光线、姿势、神态、动作；不增加人物、天气、时间、剧情。
- 图片反推：视觉模型先检查实际图片，仅依据可见证据。Jev 收到的是文字观察而非图片，不证明视觉观察本身正确。
- 固定风格、画师预设和负面提示词不变；本功能不覆盖用户保存的转换/反推模板。
- Tag 表达元素，英文关系补足位置、持物、左右手、注视、层次和遮挡，不完整复述已有 Tag。
- 约 80/20 为模板参考策略，不是官方强制比例。偏离只提示，不为凑比例编造信息。

## 可复用规划指令（与已注册工具一致）

```text
Produce a NovelAI V5 HYBRID positive prompt using langbai_decide_prompt. The host enforces format=hybrid.
Jev is OPTIONAL and controlled only by the saved user setting. Call this same tool whether Jev is enabled or disabled. Enabled: tags and relations receive real Jev scoring. Disabled: the host skips ALL Jev requests and uses your composition plan, dictionary and structural checks; scores/model/usage are null, jevUsed=false, decisionEngine=local. Do not fabricate scores, claim Jev verification, ask users to enable it merely to continue, or call DefAPI yourself. Language-model calls may still incur their own fees. If enabled but misconfigured or a Jev request fails, report the error; do not silently change the user's setting. New calls read the latest saved configuration; existing requests are not retroactively cancelled.
args.mode=text: preserve the exact args.description and moderately complete applicable missing outfit, viewpoint, framing, light, posture, expression and action detail in args.plan. Do not invent people, weather, time or story events. Plan posture from body geometry first; omit uncertain posture tags.
args.mode=image: first inspect the actual attachment with vision or langbai_reverse_prompt(mode:natural,templateVersion:v5). Supply imageAttachmentId and observations containing only visible evidence. Never use image metadata or a fictional completion as visual evidence. Every candidate requires observed:true and visualEvidence quoting observations. No invented detail, unseen hand, weather or costume. Jev receives these textual observations, NOT the image, so vision accuracy remains the inspecting model's responsibility.
args.candidates: 1..48 mature tags {tag,category,explicit:boolean,evidence?:exact user quote,observed?:boolean,visualEvidence?:exact observation quote,scope?:base|c0|c1...,group?:conflict group,facet?:viewpoint|framing,emphasis?:normal|focal|support|subtle,reason?:composition rationale,anchor?:source|target|mutual,interaction?:pair id}. Categories: count,identity,appearance,clothing,prop,scene,lighting,camera,pose,expression,action. Do not put natural language or artist/quality terms into tags. Scope conflict groups per character. Do not invent mature tags.
Weights: default normal=1. Explicit focal=1.15, optional/observed focal=1.10, support=1.05, secondary non-explicit subtle=0.9. Explain each non-normal choice. Max 2 focal and 3 total boosts, explicit first; max 3 subtle. Optional boosts require good semantic fit, not just a high score. Never weaken explicit requirements/count/identity or keep contradictions by weakening. Do not force a mix of weights.
args.relations: 1..12 brief English residual phrases {text,origin:explicit|completion|observed,evidence,dependsOn:[t0,t1...],after?:t0,scope?:base|c0|c1...}. t0 etc are candidate array indexes. English residuals add only missing spatial/handedness/ownership/gaze/occlusion/interaction information; no complete paraphrase of tags. Origin explicit quotes description; completion quotes plan (text mode only); observed quotes observations (image mode only). Link all relevant candidates; after must also be in dependsOn and the same scope. Place action relations immediately after their tags; character position phrases without after follow girl/boy/other. Without an applicable residual revise the plan minimally, never fabricate one merely for a ratio. Jev judges relations in the same request; failed relations cannot be silently replaced by tags-only output.
Aim roughly 75-85% tag units, 15-25% relation units, not an exact quota. Simple input needs at least one short nonredundant relation. Do not pad. Fixed style/artist presets and negative prompts are unchanged.
For 2..22 people supply characters:[{kind:girl|boy|other},...] in spatial order. Base contains total count, scene and global camera. Character-specific appearance, clothing, props, actions and expressions go into c0/c1 scopes. Total people counts must equal character segments. For a key paired interaction use a mature action tag in both participating scopes with matching interaction id and source/target (or mutual) anchors. Never leave a lone anchor or mislabel an English phrase as an anchored mature tag. Put held items only with their main holder.
Only when readable text is explicitly requested or visible, supply renderedText:{text,origin:explicit|observed,evidence}; include text and language tags in base. It is serialized as the last base item before character separators. No canvas direction/resolution tags (use software parameters). Use special datasets, transparent background and comic tags only for their applicable explicit/observed cases; no redundant synonyms. Text outside renderedText is English.
The result positivePrompt already contains weighted tags AND relations: pass it intact to apply_prompt/generate_image, do not reconstruct from selected tags. Only generate an image when requested. Report errors and missing coverage honestly.
```

## 校验和权重
- 酒馆工具强制 hybrid；底层未指定 format 的旧调用保留 Tag 兼容性。
- 候选最多 48 个，关系最多 12 个。t0/t1 是候选输入序号，n0/n1 是关系序号。
- explicit 引用用户原文，completion 引用文字方案，observed 引用图片观察；图片关系只允许 observed。
- 图片候选必须提供 observed=true、visualEvidence；用户要求证据与视觉证据分开。
- 关系 dependsOn 引用相关候选；after 需同段且属于依赖；依赖剔除时关系一并剔除。全部关系未通过时提示重新整理，不静默输出纯 Tag。
- 多人使用 characters 和 base/c0/c1 等 scope，总人数与人物段相等；同词、互斥组按人物段分别处理。
- 默认 1；明确 focal=1.15，补全或观察 focal=1.10，support=1.05，辅助 subtle=0.9。
- 最多 2 个 focal、总加强最多 3 个，明确重点优先；降权最多 3 个。人数和身份不加权，明确要求不自动降权。
- 补全加强至少需要 1.5 适配分和画面主次依据；分数不直接映射生图权重。
- Tag 补全阈值 1.25，关系阈值 1.5。文字最多补 8 个 Tag、同维度最多 2 个；图片已观察细节不使用补全数量上限。
- selected.weightReason、omittedRelations、ratio、warnings 返回实际处理依据。
- 本次不自动解析模板的负权重排除串，原有固定负面提示词不变。
- 数值均为工程初始策略，未通过实际画质对照校准；证据引文校验不是视觉真实性验证。

## 来源与适配
用户两份模板为设计参考。经确认将文字模板的“只转换明确内容”改为适度补全；图片模板仍只保留可见事实。原文件保留在本次 artifacts/jev-hybrid/reference 中。
官方机制参考：
- https://docs.novelai.net/en/image/multiplecharacters/
- https://docs.novelai.net/en/image/strengthening-weakening/
- https://docs.novelai.net/en/image/textrendering/
