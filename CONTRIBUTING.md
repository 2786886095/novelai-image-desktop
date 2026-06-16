# 贡献指南 / Contributing

感谢你对 Langbai NovelAI Studio 的兴趣！本项目是一个 **API-only** 的 NovelAI
桌面客户端（Electron + React + TypeScript），并附带一个 Flutter 移动端（`mobile/`）。

## 开发环境

- Node.js 20+
- npm

```bash
npm install
npm run dev        # 启动渲染层 + Electron（开发模式）
```

## 提交前请确保通过

```bash
npm run typecheck  # 渲染层 + Electron 主进程类型检查
npm test           # vitest 单元测试
npm run build      # 生产构建
```

CI 会在每次推送时对三平台（Windows / macOS / Linux）跑上述检查并打包。

## 代码结构

| 路径 | 说明 |
|------|------|
| `electron/main.ts` | 主进程入口、窗口、IPC 注册、userData 目录固定与迁移 |
| `electron/ipc/nai.ts` | NovelAI API：生成/图生图/重绘/超分/Director/反推/转换、灵感胶囊 |
| `electron/ipc/store.ts` | 本地持久化（token / 设置 / 历史 / 分组） |
| `electron/ipc/storage.ts` | 历史删除、分组导出 ZIP、命名模板 |
| `electron/data/tag-dictionary.ts` | 中文 → Danbooru 离线词库 |
| `src/store.ts` | 渲染层状态（zustand）：生成队列、暂停、Anlas |
| `src/App.tsx` | 主界面（持续拆分中） |
| `src/components/ui.tsx` | 共享 UI 基础组件 |
| `src/prompt-data.ts` | 标签分类、灵感胶囊词条 |
| `src/wildcards.ts` / `src/related-tags.ts` / `src/png-meta.ts` / `src/anlas.ts` / `src/text-utils.ts` | 纯逻辑模块（均有单元测试） |
| `mobile/` | Flutter Android / iOS 客户端（Phase 1） |

## 编写测试

纯函数请放在独立模块并补 `*.test.ts`（vitest）。参考现有的
`wildcards.test.ts`、`png-meta.test.ts`、`anlas.test.ts`。

## 约定

- 提交信息使用英文 + 约定式前缀（`feat:` / `fix:` / `refactor:` / `chore:`）。
- 不要提交 `node_modules/`、`dist/`、`release/`、`mobile/build/`（已在 .gitignore）。
- Token 等敏感信息只存本机 userData，请勿写入仓库或日志。

## 安全

- 渲染进程不直接持有 NovelAI Token；所有 API 调用都在主进程执行。
- 发现安全问题请私下联系维护者，不要公开 issue。
