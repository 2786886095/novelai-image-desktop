# 可选分级内容映射

仅当用户输入或图片明确涉及对应内容时使用。默认具备检索资格不等于自动拼接；普通场景禁止召回本文件内容。

## 衣着与暴露状态

- 大腿袜：`thighhighs`
- 连裤袜：`pantyhose`
- 破损连裤袜：`torn pantyhose`
- 半脱衣物：`unworn clothes`, `clothes pull`
- 解开衬衫：`unbuttoned shirt`
- 提裙：`skirt lift`

## 成人表情与身体表现

- 挑逗笑容：`seductive smile`
- 成人向表情：`lewd expression`
- 高潮表情：`female orgasm`, `rolling eyes`, `blush`, `open mouth`, `tears`, `saliva`, `sweat`

## 成人姿势与互动

- 所有成人互动必须先确认角色均为成年人，并清楚绑定主动方和被动方。
- 多人场景继续使用 V4.5 `base | character` 分段，成人动作不能只堆在 Base。
- 对易串位的身体关系使用 `source#` / `target#` 方向锚点和短自然语言补充。
- 不从含糊输入推断年龄、同意状态、身体部位或具体行为。

## 质量提醒

- 本资料来自用户提供的个人整理，不代表 NovelAI 官方 Tag 规范。
- 原资料包含重复、拼写错误和可能不稳定的 Tag；写入最终 Prompt 前应检索或验证。
- 不复用明显错误词，例如 `ad anatomy`、连写的 `blurrylowres`，也不复制成百上千字符的重复负面词。
