# 生图智能体与 NAI Launcher 的分层差距（2026-09-30）

参考源码固定为 [Aaalice_NAI_Launcher `c648ee60316e58a5ec45c539e28023f8a56c2db7`](https://github.com/Aaalice233/Aaalice_NAI_Launcher/tree/c648ee60316e58a5ec45c539e28023f8a56c2db7)。以下是源码对照，不是对参考项目最新版本或实际用户环境的保证。只借鉴结构，不复制其代码或素材。

| 层 | 参考项目中已确认的设计 | 本软件本轮前的状态 | 差距与优先级 |
|---|---|---|---|
| Agent 循环 | [Agent 封装](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/core/agent/agent.dart)与[双层循环](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/core/agent/agent_loop.dart)分离，支持 steering、follow-up、abort 与事件。 | Windows 用 Pi Core；Flutter 用另一套限定轮数的工具循环。两端都能中止，但运行中不能追加 steering/follow-up。 | P1：先保证权限与执行语义一致，再引入队列消息；不能把“Flutter 风格类似 Pi”说成运行同一个 Pi 包。 |
| 会话持久化 | [Session](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/core/agent/harness/session/session.dart)按消息与操作记录持久化；[恢复器](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/presentation/agent_chat/services/agent_chat_session_recovery.dart)把中断工具标为失败，不盲目重放。 | 两端保存旧 Tavern 工作区 JSON；移动端会标记中断回复，桌面没有新 Pi 专属操作日志。 | P0：重启后明确呈现未核实付费结果，禁止自动重试；P1：会话事件日志、压缩与长历史。 |
| 应用工具目录 | [Registry Builder](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/presentation/agent_chat/services/agent_tool_registry_builder.dart)统一组装生成、Prompt、标签、图库、队列、资源与上下文工具。 | Windows 新页面只接入原有 20 个工具；Flutter 也限制为同一组，未接入软件已实现的队列/资料等工具。 | P1：按领域扩展“软件内工具”，但每项必须有同名能力、参数校验、移动端等价行为与测试。 |
| 权限 | [权限目录](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/core/agent/permissions/tool_permission_catalog.dart)按领域、读写、删除、收费决策；[控制器](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/presentation/agent_chat/services/agent_tool_permission_controller.dart)由应用估价并等待真实用户确认。 | 两端主要按只读/修改二分；付费标志不等于费用估算。 | P0：付费操作展示可信的参数快照及明确的“估算/未知”；禁止模型自己确认。P1：领域策略、审计与删除双重保护。 |
| 生图事务 | [Preparation Runtime](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/presentation/agent_chat/services/generation_preparation_runtime.dart)持有准备 ID、参数快照、估算和状态；[Preparation Service](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/presentation/agent_chat/services/generation_preparation_service.dart)把准备与执行分开。 | 两端模型可直接请求 `langbai_generate_image`，应用确认只见即时参数；没有一次性准备 ID。 | **P0：先准备→显示参数及估价→用户确认→一次性执行；设置变化则拒绝并重新准备。** |
| 图片/资源引用 | [资源引用](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/core/agent/resources/agent_chat_resource_reference.dart)使用带来源的稳定身份并在工具边界验证。 | 两端已有附件/历史 ID，但部分结果仅作为普通文本或文件 URL 展示；跨来源拖入与重启后的解析未统一。 | P1：统一历史、参考预设和上传附件的类型化 ID；只允许应用解析，禁止任意路径。 |
| 聊天交互 | [Panel](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/presentation/agent_chat/widgets/agent_chat_panel.dart)拆成控制器、协调器、组件；[确认卡](https://github.com/Aaalice233/Aaalice_NAI_Launcher/blob/c648ee60316e58a5ec45c539e28023f8a56c2db7/lib/presentation/agent_chat/widgets/agent_chat_approval.dart)显示费用、目标并防重复点击。 | Windows 新页面为简单侧栏；移动端为单页加模态确认。 | P0：先在两端展示同一份准备摘要/费用；P1：可读工具时间线、响应式会话列表、草稿/滚动恢复与触控适配。 |
| 安全边界 | 参考项目也提供通用文件、命令、Skills、MCP 等能力，但这不是生图必需品。 | 本软件未向新 Agent 挂载这些能力。 | **按用户明确选择维持不开放**。这不是待补缺口；不得为“全面参考”偷偷加入。 |

## 本轮实施顺序

1. 完成 P0 生图准备事务、收费估算标记、一次性执行和设置漂移检查，Windows/Android/iOS 共用相同语义（Flutter 代码供 Android 与 iOS 共用）。
2. 两端提示用户生成结果不确定时先查看历史，绝不自动重试；测试拒绝、跨会话、重复执行、过期和配置变化。
3. 其余 P1/P2 缺口保留在本清单，不将它们称为已经完成。iOS 必须在 macOS 构建与签名后才能称为可安装交付。

## 本轮已落地与仍未落地

- Windows Pi Core 和 Flutter 共用的 Android/iOS 界面均已加入一次性 `langbai_prepare_generation`，生成工具仅接受准备 ID；准备记录限本会话、10 分钟有效，配置变化即拒绝。未准备的付费请求不得进入确认或生图。移动端实际执行前额外调用已有图片操作预检。
- 两端在确认界面展示准备时冻结的模型、尺寸、张数和费用标记；普通 NovelAI 只显示**本地估算**，兼容服务或高级参考参数标记**费用未知**，不把估算当实际账单。拒绝与异常付费结果不自动重试。
- 原有酒馆数据没有删除，通用文件/命令/外部 MCP 没有接入。Windows 使用真实 Pi Core 包；Flutter 是独立实现的有限工具循环，**并非在 Android/iOS 上运行同一 Node Pi Core**。这项技术差异与上表的 P1 会话/工具/交互缺口仍在。
- 本轮仅做调研和本地实现，未在真实 NovelAI 账号上触发收费调用；iOS 没有可在 Windows 上签名的安装包。不能把本地单测和 Android Debug 包视为全平台发布。
## 2026-09-30：以完整使用体验为目标的后续改动

本轮仍限酒馆／Agent 页面，外加用户随后明确要求修复的历史缩略图回归；没有改造全软件的信息架构。

- 首次使用：直接解释“对话模型负责理解/调用工具，NovelAI 生图继续沿用原配置”，提供配置入口与只预填、不自动发送的三个起步建议。
- 对话过程：Markdown、复制/修改要求、可读工具状态、明确运行/停止状态；查看旧消息时不再强制拖回底部，有“回到最新”。
- 操作确认：桌面改为页面内一次性确认，不再弹出系统 JSON 对话框；Flutter 同样展示准备参数/费用摘要，可取消、修改、确认，技术详情默认折叠。
- 会话：桌面搜索/重命名/删除，窄屏抽屉；Flutter 手机历史底部面板、平板常驻侧栏、会话搜索/重命名/删除，以及独立草稿。运行中避免切换产生歧义。桌面草稿保存至 sessionStorage，手机草稿目前只在页面生命周期内保留，不能称为跨重启草稿。
- 图片：结果/附件预览、继续调整；只预填追问，不自动触发新的收费请求。附件缺失有提示。
- 模型设置：不合法地址保留输入并显示错误；保存中禁重复提交；不改写自动压缩偏好。修复了 Flutter 页面卸载通知顺序及对话框关闭过渡时过早 dispose 输入控制器的问题，均由本地组件测试暴露。
- 用户追加的右侧缩略图：确认四个按钮落入三列网格形成 86px 高浮层；更换为桌面 32px 单个“更多”按钮。操作使用文字菜单，无整屏遮罩；点击菜单外另一张图片同时关闭菜单并切换图片。原画笔实为重命名，保留正确文字，不把它误称为重绘。

### 观察边界

桌面截图使用真实 React 页面/操作菜单，但 native bridge 为隔离 fixture；Flutter 截图使用真实屏幕组件与本地 fixture。没有向真实模型/NovelAI 发送消息或扣费。截图验证不等于 Windows 安装版、安卓实体机和 iOS 真机验收。

Windows 类型检查、完整桌面测试及 Flutter analyze/完整测试已执行；最终结果及字面输出保存在 `artifacts/pi-agent-transaction/ux/logs`。Windows portable 与 Android debug 包在本地重新构建；iOS 共用源码已改，但仍需 macOS 构建、签名和真机验证。上表 steering/follow-up、日志持久化、扩展工具目录等差距仍未声称完成。

## 2026-09-30：保留紫色主题、继续借鉴布局与交互

仅完善酒馆／Agent 页，保留其余页面与已确认的 104px 历史操作菜单。借鉴固定版本 Panel 的紧凑布局、有限状态区域和稳定输入层级，没有复制其代码或素材。

- 工具反馈：已完成过程默认折叠；运行中／失败过程默认展开，可手动切换。技术详情仍默认折叠。
- 确认区：从消息历史中独立出来；方案内容有高度上限并可滚动，取消／修改／确认按钮不随内容滚走。普通重绘等确认也使用同一布局约束。
- 输入：桌面输入区自动增高，保留中文输入法保护；手机键盘弹出时不替换输入组件，保留焦点与未发送文本。
- 会话：两端在当前页面生命周期内记住每个会话的阅读位置，不强制回到最新；不声称跨重启恢复滚动位置。
- 侧栏与留白：桌面侧栏 220px、平板 228px；窄屏沿用原有抽屉／历史面板。手机确认操作分成等宽的 44px 点击行。

本地浏览器使用真实 React 页面＋隔离 native bridge；手机／平板与键盘检查使用真实 Flutter 组件＋fixture。Windows portable 与 Android debug 包重新构建。iOS 使用同一已修改 Flutter 界面，但仍无 macOS 签名包或真机验收；没有调用真实模型或收费接口。新增回归覆盖折叠、手机键盘焦点与布局、普通工具确认、跨会话阅读恢复。上表 steering/follow-up、事件日志、扩展工具目录不属于本轮，仍未完成。
