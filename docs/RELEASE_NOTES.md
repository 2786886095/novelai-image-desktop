## Langbai NovelAI Studio 2.3.2

### v2.3.2 更新内容

#### Vibe 文件兼容（电脑端与手机端）
- 氛围迁移新增 Vibe 文件导入，支持 `.json`、`.naiv4vibe`、`.naiv4vibebundle` 单项与合集格式，一次最多 16 项。
- 支持只有编码、没有原图的参考文件；保留名称、适用模型、信息提取率、参考强度和多组编码。
- 匹配模型与信息提取率时直接使用文件中的编码，避免重复编码请求，并正确计算编码费用。
- 提供模型不匹配提示；缺少原图且没有匹配编码时阻止无效请求。编码参考不显示损坏的图片占位。
- 支持导出原生 Vibe 合集，便于再次使用和跨端传递。

### 使用方法
生成 → 氛围迁移 → 导入 Vibe 文件。选择文件对应的模型；例如 V4.5 Full 编码应配合 V4.5 Full 使用，不能直接用于 V5。只有编码的参考支持调整强度，信息提取率使用文件内的对应值。

### 安装包
- Windows x64 安装版 `Langbai-NovelAI-Studio-Setup-2.3.2.exe` 与便携版 `Langbai-NovelAI-Studio-2.3.2.exe`。
- macOS Universal DMG/ZIP、Linux x64 AppImage。
- Android 稳定签名 APK；iOS IPA 未签名，需要自行签名。

### 验证
发布门禁包括桌面类型检查与测试、Windows/Linux/macOS 安装包原生启动及图片编解码检查（含 Intel Mac）、Android/iOS 分析测试与构建、Android 签名延续与升级版本检查、更新文件哈希校验。本次未进行移动端真机或真实付费生图测试。
