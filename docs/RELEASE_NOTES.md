# 发行说明

## Latest — 批量元数据、在线画廊与四语离线 Tag

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/latest/download/verification.json)

- 桌面与手机工具区新增「图片元数据处理」：批量去除或修改 NovelAI 和 Stable Diffusion 的静态 PNG / WebP 生成元数据，另存 PNG，不覆盖原图。
- NovelAI 默认使用官方联网读取，可切换本地并记住设置；官方失败只提示手动切换，不自动回退。读取只下载官方公开程序资源，不上传图片。
- 在线画廊新增 NAX：按模型浏览合集目录，点击打开原站。
- 在新手引导、设置、提示词工具中选简体中文、繁體中文、日本語或 한국어，直接下载对应离线 Tag 词包。选中的词库用于 Tag 补全和 MCP 搜索，保留英文 Tag 和所选语言释义。
- Android 使用正式签名 APK。iOS 为未签名 IPA，需自行签名；不能直接装到普通 iPhone，不是 App Store 或 TestFlight 发布。
