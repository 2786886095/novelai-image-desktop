### v2.5.7 更新内容

## 本次更新
- 接入本地 MCP 服务，默认关闭；提供本机外部智能体连接设置，并补充鉴权、来源、账户绑定与额度限制等边界保护。
- 接入独立配置的 OpenAI 图像编辑重绘引擎，保留 NovelAI 重绘；按蒙版区域合成结果，不消费 Anlas，不自动重试付费请求。
- 修复重绘笔刷拖出可见画布后仍保持捕获的问题：结束笔画并释放指针，返回画布不会继续误画；保留画布平移。
- 支持读取 NovelAI 官网 WebP 图片内的生成参数，保留 PNG 元数据读取。
- 在线画廊从图片详情返回时恢复列表与浏览位置，并统一系统后退操作。
- 修复 Google 翻译对常见下划线英文标签漏译的问题，桌面及移动端共享测试样例同步。
- Agent 组件下载采用已批准的公开文件入口并请求新重定向，保留大小、SHA256 校验及离线复用验证。
- 补充用于整个软件检查的 Claude 审查文档；该文档不代表全部功能已完成实体设备或付费接口验收。

## 发行范围与验证
公开提供 Windows x64 安装版与便携版，并附 latest.yml 和 verification.json。移动端源码版本为 2.5.7+176，本次不发布 Android/iOS 二进制。

保留桌面类型检查与测试、移动端分析与测试、跨平台原生构建、真实打包运行及字体、实际 NSIS 解码、Windows 全新安装及 2.4.0 升级数据保留、智能体在线获取及离线复用等正式发布门槛。

重绘边界修复完成相同输入的基线、修改与回滚检查，回滚原始哈希一致。没有证明操作系统指针发生物理位置跳转；未执行真实付费生图或移动实体设备验收。

Windows 包未代码签名，SmartScreen 可能提示未知发布者；请从本仓库正式 Release 下载并核对 SHA256。

## 下载
- [Windows 安装版](https://github.com/2786886095/novelai-image-desktop/releases/download/v2.5.7/Langbai-NovelAI-Studio-Setup-2.5.7.exe)
- [Windows 便携版](https://github.com/2786886095/novelai-image-desktop/releases/download/v2.5.7/Langbai-NovelAI-Studio-2.5.7.exe)
