## Langbai NovelAI Studio 2.2.10

### v2.2.10 更新内容

#### 酒馆 AI 生图世界书（电脑端 / Flutter 同步）
- 按右侧生图模型自动选择技术指导：V5 使用 9.7，V4.5 使用 8.31（含 Full / Curated）。
- 每套收录 15 个技术原文条目；正文逐条核对，不使用此前的精简摘要。排除不适合内置的混合示例/前置思考及其他模型条目，不是两份原始 JSON 的全文件复制。
- 世界书变量在单次请求、单本世界书内展开，不运行脚本，不串用其他会话的变量。
- 保留现有结构化生图及局部修订契约。右侧模型、尺寸、张数、负面词和风格提示词仍是权威设置，空值保留，不按原书配额额外生成图片。
- 已有会话加载时刷新内置条目，保留用户自建世界书、角色生图设置及已保存的条目启用状态。

### 验证口径
本地桌面 974 条测试通过，Flutter 535 条通过、1 条跳过，类型检查及两端构建通过。发行包另外经过各平台 CI 构建与桌面原生运行时/启动检查后发布。
未对这套世界书进行真实付费模型生成质量验证，不承诺提升幅度；详细内容与运行适配说明见仓库 docs/TAVERN_IMAGE_GUIDANCE.md。

### 安装与更新
- Windows 安装版：`Langbai-NovelAI-Studio-Setup-2.2.10.exe`；便携版：`Langbai-NovelAI-Studio-2.2.10.exe`。
- macOS：`Langbai-NovelAI-Studio-2.2.10-universal.dmg` / `Langbai-NovelAI-Studio-2.2.10.zip`；Linux：`Langbai-NovelAI-Studio-2.2.10.AppImage`。
- Android：稳定签名 APK。iOS：未签名 IPA，需要自行签名，不是 App Store 安装包。
- 请把图片和用户数据保存在安装目录之外。世界书原文比精简版更长，会占用更多对话上下文。
