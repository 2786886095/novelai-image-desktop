# Skill 市场前端实践调研与本项目落地准则

调研日期：2026-06-15

## 调研来源

- LobeHub Web & Frontend Development：
  - https://lobehub.com/zh/skills?category=web-frontend-development
  - https://lobehub.com/skills?category=web-frontend-development
  - 重点描述：React、Vue、CSS 工具链、组件生成、可访问性审计、前端构建技能，用于更快交付漂亮界面。
- LobeHub frontend-design：
  - https://lobehub.com/skills/dep-agent-rules-frontend-design
  - 重点描述：创建有辨识度、生产级、高设计质量的前端界面。
- LobeHub frontend-design 变体：
  - https://lobehub.com/skills/oabdelmaksoud-openclaw-skills-frontend-design
  - 重点描述：避免 generic AI slop，注重真实可工作的代码、审美细节、创意选择。
- LobeHub design-system 相关推荐：
  - https://lobehub.com/skills/oabdelmaksoud-openclaw-skills-frontend-design
  - 重点描述：生产级设计系统、可访问性、响应式、主题、组件集合、设计 token。
- SkillHub Frontend：
  - https://skillhub.pm/categories/frontend
  - 重点描述：UI components、design systems、component generation，同时列出性能优化、测试驱动、代码审查、安全加固、浏览器测试、API/interface design 等工程技能。
- Claude Code Marketplaces：
  - https://claudemarketplaces.com/skills/lobehub
  - 重点描述：聚合 Claude Code 插件、扩展、工具与技能市场。
- MCP Market：
  - https://mcpmarket.com/
  - 重点描述：AI 工具/服务市场的共同模式是“工具能力可发现、调用前解释、失败可诊断”，适合本项目的后台网页适配器。
- Glama MCP Directory：
  - https://glama.ai/mcp
  - 重点描述：强调工具描述、输入输出 schema、可验证能力边界；对应本项目应把每个 NovelAI 功能做成可诊断 adapter。
- Smithery：
  - https://smithery.ai/
  - 重点描述：工具化集成强调安装、配置、运行状态和错误反馈，这对应桌面端设置页与诊断页。
- Ultimate Frontend Design Skill：
  - https://github.com/kesslerio/ultimate-frontend-design-openclaw-skill
  - 重点描述：反 AI 模板化、移动优先、React + Tailwind + shadcn/ui、明确审美方向。

## 对 NovelAI 图像桌面控制台的直接要求

### 1. 信息架构优先

当前产品不是普通网页，而是“复杂生图工作台”。功能必须按决策顺序组织：

1. 账号/余额/成本状态。
2. 输入：提示词、负向提示词、基图、参考图、遮罩。
3. 主功能：文生图、图生图、局部重绘、增强、放大、导演工具。
4. 全局控制：Vibe、精确参考、多角色。
5. 输出：自动捕获、本地保存、历史分组、复用参数。

### 2. 成本状态必须结构化

不能只显示一段按钮文字。必须结构化读取：

- 官方按钮文字。
- 官方执行按钮是否可点击。
- 官方成本文本来源：执行按钮 / 页面提示 / 本地门禁 / 错误。
- 官方显示成本。
- 账号余额 Anlas。
- 是否可执行。
- 是否积分不足。
- 不可执行原因。
- 候选按钮列表，用于定位网页改版导致的 selector 错误。

这已经在当前实现中落地为 `NovelAiCostStatus`：

- `buttonText`
- `buttonDisabled`
- `buttonContext`
- `costText`
- `costSource`
- `balanceText`
- `canGenerate`
- `insufficientBalance`
- `blockingReason`
- `candidates`

实现约束：成本优先从“官方执行按钮”读取，不再从整页随意抓 `Free` / `Anlas`，避免把试用卡片或余额误认为功能成本。

### 3. 登录/退出必须产品化

退出登录不是“清缓存然后自动打开官方网页”。正确行为：

- 回到本地登录门禁。
- 不自动读取旧账号。
- 不自动进入工作台。
- 用户重新登录成功后才解除本地登录锁。

### 4. UI 设计准则

- 所有英文按钮必须有中文解释。
- 所有危险操作必须明确后果。
- 生成按钮必须始终解释“当前将执行哪个主功能”。
- 全局参考功能必须标注“不会单独生成，会叠加到当前主功能”。
- 积分不足必须直接提示，不允许无响应。

### 5. 工程准则

- 每个功能使用专用 adapter，而不是模糊点击。
- 每个 adapter 至少暴露：prepare、syncInputs、readCost、run、capture。
- 后台网页 DOM selector 失败时必须给出可排查的 debug snapshot。
- 执行前必须先做本地前置校验：提示词、基图、源图、遮罩、导演工具输入图等缺失时直接提示，不进入“点了没反应”状态。
- 生成失败必须带上网页状态、官方按钮、候选按钮，方便判断是余额、验证码、上传失败、按钮不可点还是网页改版。
- 所有发布前必须跑：
  - `npm run typecheck`
  - `npm run build`
  - `npm run pack`
  - BAT 启动验证

## 本轮已落地变更（2026-06-15）

1. 成本读取从“整页文本猜测”改为“执行按钮优先”：
   - `official-action-button`：来自官方执行按钮。
   - `official-page-message`：来自官方页面提示。
   - `local-login-gate`：来自本地登录门禁。
   - `error`：来自读取错误。
2. `NovelAiCostStatus` 增加按钮上下文、是否禁用、候选按钮列表。
3. 前端“功能积分”卡片显示：
   - 官方执行按钮。
   - 成本来源。
   - 官方余额。
   - 执行状态。
4. 执行按钮在已知官方按钮不可生成时禁用。
5. 后台执行前增加功能前置校验：
   - 文生图缺提示词。
   - 图生图缺基图。
   - 局部重绘缺基图或遮罩。
   - 增强/放大缺源图。
   - 导演工具缺输入图。
6. 生成后未捕获图片时，错误信息附带网页状态、官方按钮和候选按钮。

## 下一批商业化缺口

1. Playwright/Electron 自动验收脚本。
2. 每个 NovelAI 官方功能的专用 DOM 状态机。
3. 成本读取结果持久化到历史记录。
4. 生成失败原因分类：未登录、积分不足、上传失败、按钮不可点击、捕获超时、网页改版。
5. 视觉系统 v3：设计 token、统一控件、状态色、响应式布局。
