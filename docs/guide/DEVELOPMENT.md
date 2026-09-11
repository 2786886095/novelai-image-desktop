# 源码运行与构建

[返回项目首页](../../README.md) · [贡献指南](../../CONTRIBUTING.md)

这里只面向开发者。下载并使用安装包不需要执行以下命令。

## 桌面开发

准备兼容项目工具链的 Node.js 与 npm，在仓库根目录运行：

```powershell
npm ci
npm run dev
```

项目使用 Electron + React + TypeScript，`npm run dev` 同时启动 Vite 渲染端和 Electron 主进程。

## 检查与打包

```powershell
npm run typecheck
npm test
npm run build
npm run pack
```

`npm run pack` 在 Windows 同时生成便携版与 NSIS 安装版。只需便携版时使用 `npm run pack:portable`。Windows 发行使用仓库 CI。

v2.2.4 的 Windows 产物示例：

```text
release/Langbai-NovelAI-Studio-2.2.4.exe
release/Langbai-NovelAI-Studio-Setup-2.2.4.exe
release/Langbai-NovelAI-Studio.exe
release/latest.yml
```

兼容旧启动脚本的别名 `release/NovelAI-Image-Desktop.exe` 仍会生成。根目录 `启动程序.bat` 是开发 / 本地运行相关入口，不应替代给普通用户的安装包指引。

## 代码地图

| 位置 | 职责 |
| --- | --- |
| `electron/main.ts` | 窗口、主进程与 IPC 注册 |
| `electron/ipc/nai.ts` | NovelAI API、反推、转换与模型检测 |
| `electron/ipc/store.ts` / `storage.ts` | 设置、历史、目录与分组 |
| `electron/preload.ts` | 暴露受控的渲染进程接口 |
| `src/app/` | 顶部导航与工作区外壳 |
| `src/AgentPage.tsx` / `src/tavern/` | 酒馆交互、角色卡、上下文与生图方案 |
| `src/ToolsHub.tsx` / `src/comic/` | 工具入口与漫画分镜流程 |
| `src/MetadataInspector.tsx` | 图片原数据查看 |
| `src/store.ts` / `src/types.ts` | 状态、共享类型和默认参数 |

## 发行与协作

版本标签 `v*` 触发 Windows 工作流，并将产物汇总到同一个 Release。维护者发布前应检查版本字段、测试结果、发行说明及 CI 权限；README 编辑本身不需要创建发行标签。

[桌面工作流](../../.github/workflows/build.yml) · [版本记录](../RELEASE_NOTES.md)

不要提交 Token、服务 Key、本机用户配置或私人素材。贡献前阅读 [CONTRIBUTING.md](../../CONTRIBUTING.md) 与 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。
