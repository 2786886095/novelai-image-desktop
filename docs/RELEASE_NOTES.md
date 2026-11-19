# 发行说明

## Latest — 相关 Tag 检索、提示词模板与漫画分镜

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/latest/download/verification.json)

- 英文 Tag 和当前词包译名支持连续片段检索；按关联度排序时，完整匹配优先，其次是开头匹配，再是中间或末尾匹配。
- 已有简体中文词包无需重新下载。例如输入「构图」或 `utch_ang` 都能找到 `dutch_angle`（荷兰角/斜角构图）。桌面 MCP 的 `search_tags` 使用相同的匹配规则。
- 桌面工作台、灵感胶囊和 MCP 支持主题相关检索。例如在当前简体中文词包搜「构图」，先列出 13 个字面匹配，再列出 299 个相关标签，包括俯视、特写、全身；结果去重，同档按使用量排序。
- 转换和反推分别记住模板版本，桌面与 MCP 共用选择；升级保留旧版自定义正文，历史模板仍可编辑。漫画支持审阅文字分镜后逐页编译，整页与单分镜模板独立。
- 经典与新版统一漫画模板、画风和参考预设分组菜单。
- Android、iOS 同步版本号。Android 为签名 APK；iOS 为未签名 IPA，需自行签名，不能直接安装到普通 iPhone。
