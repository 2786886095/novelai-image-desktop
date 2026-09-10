## Langbai NovelAI Studio 2.2.9

本次更新同时覆盖电脑端与 Flutter 手机端。

### v2.2.9 更新内容

#### 提示词与抽卡
- 角色提示词、负面词、位置坐标随生成参数保存，重启后恢复；支持角色预设保存、应用、重命名和删除。
- 已保存的风格预设可以重命名，参考图可从历史记录选择。
- 随机抽卡支持自定义画师候选列表，不与排行榜混用；收藏可批量转为独立风格预设，并复制预览图，保留原收藏。

#### 图片操作
- 电脑端大图支持放大后左键拖动及方向键连续切换。
- 手机端酒馆、图库、漫画、抽卡和预设大图统一提供前后切换与缩放；下载或分享操作跟随当前图片。
- 历史图片删除增加确认，避免误删。

#### 修复与打包
- 修复桌面目标画风评分模型下载不使用 AI 代理的问题；先准备评分模型再开始迭代生成，失败保留已下载文件并说明原因。
- 规范误填为具体操作路径的 NovelAI 接口地址，保留用户配置的代理前缀。
- 保留 sharp 图片编解码依赖，补齐 macOS/Linux 评分运行时，并增加安装包内原生模块与启动检查。
- 元数据种子导入沿用已修复逻辑，纳入回归测试。

### 安装说明
| 平台 | 文件 |
| --- | --- |
| Windows 安装版 | `Langbai-NovelAI-Studio-Setup-2.2.9.exe` |
| Windows 便携版 | `Langbai-NovelAI-Studio-2.2.9.exe` |
| macOS 通用 | `Langbai-NovelAI-Studio-2.2.9-universal.dmg` / `Langbai-NovelAI-Studio-2.2.9.zip` |
| Linux | `Langbai-NovelAI-Studio-2.2.9.AppImage` |
| Android / iOS | `app-release.apk` / `novelai-mobile-unsigned.ipa` |

- Windows：安装版与便携版；macOS：通用 DMG/ZIP；Linux：AppImage。
- Android：使用稳定签名的 APK，可覆盖安装兼容的既有正式版。
- iOS：无签名 IPA 仅用于自行签名测试，不是可直接安装的 App Store 版本。
- 更新前请保留用户图片和工作区；自定义输出目录应位于安装目录之外。

发布前保持草稿状态；所有构建及验收门禁完成后才公开。
