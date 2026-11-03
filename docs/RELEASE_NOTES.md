# v2.7.2 — 手机输入修复与中转站推荐

## 更新

- 修正 Android 种子、批量数量输入弹层在键盘出现时访问已卸载 context 的问题；未宣称完成 Redmi K70 真机验证。
- 桌面账户管理右侧、手机账户页顶部新增 NovelAI 中转站推荐。左侧使用网站首页蓝白 LN Logo，图片随软件内置；外部浏览器仅打开 https://nai.langbai.cc，不附带账号、Token 或查询参数，不自动更改 API 配置。浏览器打开失败保留本地反馈。
- 同步简繁中、英语、日语、韩语文案；保留当前功能与数据。五平台均从本次源码重新构建，不使用旧包改名。

## 验证与发行范围

- 已完成相关桌面88项、移动端13项测试、渲染器类型检查、Dart定向分析及源码副本回滚／重放。Windows同源本地候选已实际打开并目视确认 Logo；手机版截图来自真实 Flutter 页面渲染，使用无账号测试状态与内置字体，不是真机截图。
- 维护者本次明确授权五平台按本次范围直接发布，披露未完成项。完整功能矩阵、原生设备、GPU／本地模型、真实账号与付费生图等未完成验收不标记通过；CI编译、依赖闭包、签名与制品核对不等于全量验收。实际构建与附件证据以 verification.json 为准。
- iOS IPA未签名，需自行签名／侧载，不能直接安装到普通iPhone；不等于App Store或TestFlight发行。Windows Authenticode与macOS公证未作认证承诺。更新清单与签名状态以实际制品核对为准。
- 本地 Agent 组件和画风迭代仍仅 Windows；不扩大其他平台支持范围。

下载：[Latest](https://github.com/2786886095/novelai-image-desktop/releases/latest)；源码：[main](https://github.com/2786886095/novelai-image-desktop/tree/main)。历史记录见[归档目录](./history)。
