## Langbai NovelAI Studio 2.2.7

本次为电脑端更新（Windows / macOS / Linux），手机端安装包维持 v2.2.5。

| 系统 | 文件 |
| --- | --- |
| Windows 安装版 | `Langbai-NovelAI-Studio-Setup-2.2.7.exe` |
| Windows 便携版 | `Langbai-NovelAI-Studio-2.2.7.exe` |
| macOS 通用 | `Langbai-NovelAI-Studio-2.2.7-universal.dmg` / `Langbai-NovelAI-Studio-2.2.7.zip` |
| Linux | `Langbai-NovelAI-Studio-2.2.7.AppImage` |

### v2.2.7 更新内容

修复正常酒馆用户被更新拦截：
- 酒馆工作区默认保存在系统应用数据目录，不再默认创建在安装目录内。
- Windows 安装程序在卸载旧版前，自动将旧酒馆会话、附件及备份复制到安装目录外，逐文件核验 SHA-256，全部成功才继续升级。失败时保留旧软件和原数据。
- 新版自动恢复工作区，并重定位会话、草稿、工具生图及候选回复中的附件路径；原始备份和既有其他工作区均保留，不覆盖。
- 新版首次启动明确提示迁移完成，并提供打开数据目录按钮。
- 重试更新或再次启动不会用旧备份覆盖新版中的编辑。

### v2.2.6 用户如何更新
如果旧版已提示 UPDATE_DATA_AT_RISK / LangbaiWorkspace，请从本发布页下载 **Langbai-NovelAI-Studio-Setup-2.2.7.exe**，关闭旧版后运行。旧版本自身的下载前拦截逻辑不会被服务器上的新安装包改变，因此这次可能需要手动启动新安装包；之后使用新版内置更新。

不要删除 LangbaiWorkspace。新安装包会先验证备份，再安装。迁移副本位于系统应用数据目录 novelai-image-desktop/workspace-migrations，各副本保留 original 原始目录与 active 工作目录。

### 仍然保护的路径
自定义图片输出、下载、备份或日志目录若位于安装目录内，仍需先将文件保留到安装目录外并修改保存位置。这次只自动迁移软件自身创建的酒馆工作区，不会擅自移动其他用户目录。

macOS 通用包仍未签名。内置工作流、模型密钥和用户图片均不会打包进发布资产。
