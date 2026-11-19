# 发行说明

## Latest — 工作台离线 Tag 检索

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/latest/download/verification.json)

- 英文 Tag 和当前词包译名支持连续片段检索；按关联度排序时，完整匹配优先，其次是开头匹配，再是中间或末尾匹配。
- 已有简体中文词包无需重新下载。例如输入「构图」或 `utch_ang` 都能找到 `dutch_angle`（荷兰角/斜角构图）。桌面 MCP 的 `search_tags` 使用相同的匹配规则。
- Android、iOS 同步版本号。Android 为签名 APK；iOS 为未签名 IPA，需自行签名，不能直接安装到普通 iPhone。
