## Langbai NovelAI Studio 2.4.5

### v2.4.5 更新内容
- Android / iOS 共用的 Flutter 界面新增本地原图收藏、提示词优化与助手、可保存的导航排序；保留原图与既有资料。
- 生图沿用 NovelAI 官方或兼容中转的现有 Token 与图片接口，不再显示独立 OpenAI Images 生图面板；旧选择器自动迁回 NovelAI，旧配置元数据不被删除。
- 非官方图片接口允许开关默认开启；仅在用户另行启用时，中转返回 401/403 才会用相同 Token 向官方重试。官方 Token 可能消耗 Anlas，真实付费请求未经自动化调用。
- Android Agent 的内置插件随经过验证的 ARM64 适配组件升级：先复制资料、探测完整插件组合，确认后备份激活；自定义或改动过的插件不被静默覆盖，也**不会**独立自动 npm 更新。iOS 没有本地 Harness，沿用远端 Agent。
- Android 正式 APK 须用连续签名验证后才能覆盖旧版；iOS 构建包仍为无签名 IPA，需自行签名或侧载。自动化构建不等于真机验收。

### 下载与平台
- Windows x64：`Langbai-NovelAI-Studio-Setup-2.4.5.exe`（安装版）、`Langbai-NovelAI-Studio-2.4.5.exe`（便携版）。
- macOS：通用 DMG / ZIP，未签名；Linux x64：AppImage。
- Android：`app-release.apk`；iOS：`novelai-mobile-unsigned.ipa`，需自行签名或侧载。
