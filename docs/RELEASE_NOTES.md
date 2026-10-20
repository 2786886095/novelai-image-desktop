# 更新记录

## Latest · 本次更新

- **本地 ComfyUI（桌面端）**：新增「工具 → 本地 ComfyUI」，在软件内选择环境、启动与安全停止，显示启动中／就绪／失败原因，不自动打开网页；也可连接本机已有实例，断开不会结束外部进程。
- **模型与工作流**：提供 MOSS-Image SFT、Anima Base、Krea 2 Turbo 三套直接提示词 API 起点；支持导入 API JSON、可证明转换的 UI JSON 及 PNG/WebP 工作流元数据，按本机实际节点选择扩散模型、编码器、VAE 和参数。缺失或不确定的节点、动态控件会阻止提交并给出原因，不猜参数。
- **任务与结果**：软件内显示队列、采样与节点进度，支持针对本任务取消、结果预览和参数复用；断线查询原任务，不自动重复提交。ComfyUI 记录独立保存，不覆盖 NovelAI 账号、配置或历史。
- **启动保护**：仅监听本机回环，默认禁用第三方节点，启动不继承账号密钥；停止后等待端口释放，支持同端口再次启动。MCP 客户端版本标识同步应用版本。

**本轮实测范围**：Windows 本机软件内三种模型均完成真实出图、参数与图片摘要核对及启动／停止／重启。工作流起点不包含官方模板全部可选增强分支；任意插件、任意工作流或 macOS／Linux 模型推理没有因此获得验收。环境、模型和依赖须用户自备，软件不会自动改动它们。Android／iOS 本轮仅同步版本，没有本机 ComfyUI 入口。

**安装限制**：iOS 附件是未签名 IPA，需自行签名，不能直接安装到普通 iPhone，不是 App Store／TestFlight 版本。Windows 代码签名及 macOS 签名／公证以实际制品为准，当前不承诺已完成。

[本地 ComfyUI 使用说明](https://github.com/2786886095/novelai-image-desktop/blob/main/docs/COMFYUI_LOCAL.md) · [历史更新](https://github.com/2786886095/novelai-image-desktop/tree/main/docs/history)
下载与实际附件：[Latest](https://github.com/2786886095/novelai-image-desktop/releases/latest)；当前源码：[main](https://github.com/2786886095/novelai-image-desktop/tree/main)。
