# 酒馆 Agent 独立更新

## 当前行为

- 软件启动 15 秒后及每次进入酒馆页面检查官方 Harness、Roleplay、插件管理器、市场及 Memory 源码版本；只读取版本元数据，不自动安装官方预览版。
- 两项更新均先验证摘要、平台/协议、自定义插件状态及隔离启动；通过后由用户确认，只安装本软件仓库发布的 `agent-vX.Y.Z` 兼容组件。Agent 运行时不更新；新会话默认 Roleplay，已有的显式默认选择和会话模式不变。
- 新增、修改、删除过文件的用户插件按**整个插件**保留，不与新版文件混装。未改动的随附插件可以整体迁移。更新前备份 `TavernAgent/user-home`，保留旧版本目录和 `previous.json`。
- 平台、架构、protocol、版本、下载体积、SHA-256 和 Node/CLI 探针通过后才激活。发生迁移/激活错误时回滚已迁移文件。第三方插件和远端模型行为仍需针对性验证，检查通过不代表所有插件组合永远兼容。

## 发布者流程

1. 升级 `harness/community/lock.json` 中经过验证的版本及摘要，不使用浮动 latest 依赖。更新 `harness/build-component.mjs` 的组件版本，选择干净的构建目录，并同步 `package.json` 和开发启动器的 seed 路径。
2. 运行 `D:/node.exe harness/build-community.mjs`，然后 `D:/node.exe harness/build-component.mjs harness-component012`（今后使用对应新目录）。
3. 运行 TypeScript、Vitest、真实隔离 Agent 启动与浏览器测试。必须验证 Roleplay 实际存在、默认选中且无 broken 标记，而不是只验证 HTTP 200。
4. 运行 `D:/node.exe scripts/package-harness-release.mjs`。脚本仅打包清单内且校验过的组件文件，再重新读取 ZIP 校验每个成员，不包含用户目录。
5. 将产生的 `tavern-agent-win32-x64-protocol1.zip` 作为**正式 GitHub Release**附件发布到 `2786886095/novelai-image-desktop`，标签必须为 `agent-vX.Y.Z`，清单版本须一致，保留 GitHub 生成的 `sha256` 资产摘要。草稿和 prerelease 不向客户端提供。
6. 先在干净用户目录和保留自定义插件的升级目录验证，再通知用户停止 Agent、确认更新。发布组件不等于发布桌面程序；IPC/桥接协议变化必须同时发布支持该协议的桌面程序，并提升协议版本，旧程序不得安装不兼容组件。

## 恢复

停止 Agent 后，保留出错现场。`previous.json` 指向升级前引擎；`backups` 中对应时间的用户目录应与旧引擎配对恢复，避免只降级引擎却继续使用新版数据。不要删除备份或在 Agent 运行时覆盖用户目录。

新版备份只复制普通文件，目录链接记录在 `.studio-backup-links.json`，不创建需管理员权限的符号链接，也不遍历链接指向的外部目录；`.studio-backup-complete` 最后写入。缺少完成标记的备份不能用于恢复。旧引擎目录继续保留，不能先清理链接目标。

恢复工具函数 `restoreHarnessBackup` 位于 `electron/ipc/harness-backup.ts`，仅接受不存在的新目标目录，先恢复文件，再将目录链接还原为 Windows junction。恢复到隔离目录并确认用户文件与插件可读后，再由维护者配对旧引擎切换；不是直接覆盖正在运行的用户目录。文件符号链接仍受操作系统权限约束，恢复报错时保留原目录，不把半成品当作已恢复。

本次 Windows x64 兼容组件：0.1.2；Harness 0.1.7-rc.2、Roleplay 0.1.8、插件管理器 0.2.11、市场 1.66.1、Memory 0.7.0。Memory 以其 [源码 package.json](https://raw.githubusercontent.com/Spirtxiaoqi7/mindspace-dsh-session-memory/main/package.json) 核对版本，非 npm latest。
