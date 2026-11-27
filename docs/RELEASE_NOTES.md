# 发行说明

## Latest — 生成中浏览历史大图与第三方中转生图修复

- 桌面端在生成图片时可点击右侧「历史与素材」放大旧图、缩放及翻页，不更换生成输入。新图完成时仍停留在正在看的旧图；空闲时单击缩略图仍按原方式切换画布。经典与新版布局均支持。

- 原生中转账户粘贴完整生图地址时，保留自定义前缀，不重复拼接接口；只读验证与生图使用一致的前缀。验证成功不代表已测试生成。
- 支持中转在流式接口直接返回 PNG、JPEG 或 WebP，以及将 MessagePack 误标为事件流的响应。
- 网关返回 502 或 504 时，不因错误文案提及流式限制而重新提交。普通生图接口返回 404 时提示核对地址与接口类型。
- 中转专项使用本地模拟服务验证，没有使用用户 Token 或向第三方站点发起付费请求。本次修复针对桌面端，手机端随五平台发行同步构建。

Windows、macOS、Linux 和 Android 用户可从发行附件手动下载对应平台包。iOS IPA 未签名，普通 iPhone 需自行签名后安装。

[当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [下载](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [历史发行说明](https://github.com/2786886095/novelai-image-desktop/tree/main/docs/history)
