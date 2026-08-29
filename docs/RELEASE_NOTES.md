## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.9.8.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.9.8.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.9.8-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.9.8.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.9.8.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.9.8 更新内容
- 重点修复 Android/iOS 全屏重绘蒙版在连续涂画较多区域后明显卡顿的问题：蒙版预览改为增量缓存，只重录当前小段笔迹；完成笔迹只绘制一次，并隔离原图、蒙版和光标的重绘层。
- 同一 NovelAI 8×8 源图蒙版格内的高频触摸点会安全合并，仍由连续栅格算法补齐斜线，不改变最终导出的蒙版轮廓，同时显著减少长笔迹的数据量。
- 方形与圆形画笔改为批量提交栅格路径，圆形笔尖复用缓存，降低大画笔在移动设备上的绘制开销；补充了连续 320 次触摸移动、蒙版显示与橡皮擦回归测试。
- 桌面端与 Android/iOS“关于我们”将交流群明确标注为 **NovelAI QQ交流群**，群号仍为 **921985070**。
