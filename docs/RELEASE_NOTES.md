### v2.5.5 更新内容

## 本次更新
- 修复在线画廊列表被统计、可选配置和整页缩略图下载拖住的问题；列表先显示，图片在可见区域逐张加载。
- 覆盖 AITag、Danbooru、Safebooru、Gelbooru、QuickTagCloud、tags.gallery 与画师排名入口。
- 画廊请求按实际目标网址使用现有代理设置；网络请求有总超时，缩略图使用独立并发队列，不阻塞列表查询。
- 统计不可用时不伪造总数，部分集合失败时保留可用结果并显示失败信息；保留缓存校验及来源请求头。
- Android/iOS 共享画廊源码同步，缩短无限等待并将可选配置移出列表展示路径。
- 保留 v2.5.4 的自动对比范围、F1 复制防护、Vibe 文件导入与负面提示词库，以及现有字体、角色和重绘尺寸功能。

## 发行范围与验证
公开提供 Windows x64 安装版与便携版，并附 latest.yml 和 verification.json。移动端源码版本为 2.5.5+174，本次不发布 Android/iOS 二进制。

保留桌面类型检查与测试、移动端分析与测试、三平台原生构建、真实打包运行与字体、实际 NSIS 解码、Windows 全新安装及 2.4.0 升级数据保留、智能体在线获取及离线复用等既有正式发布门槛。

画廊修复已完成七个入口的真实联网和实际打包界面验证，以及同输入原版/修复版/回滚对照。网络测试不消耗用户生图积分；网站偶发超时仍可能发生，不承诺所有网络或服务端的固定速度。源码同步与 CI 验证不等同于移动实体设备或付费中转生图验收。

Windows 包未代码签名，SmartScreen 可能提示未知发布者；请从本仓库正式 Release 下载并核对 SHA256。

## 下载
- [Windows 安装版](https://github.com/2786886095/novelai-image-desktop/releases/download/v2.5.5/Langbai-NovelAI-Studio-Setup-2.5.5.exe)
- [Windows 便携版](https://github.com/2786886095/novelai-image-desktop/releases/download/v2.5.5/Langbai-NovelAI-Studio-2.5.5.exe)
