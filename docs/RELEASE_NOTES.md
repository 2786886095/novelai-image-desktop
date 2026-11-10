# 发行说明

## Latest — Android 分段备份可恢复

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main)

- Android 手动备份先尝试完整导出；遇到可捕获的内存不足才切换到加密分段备份（`.naisparts`）。如果分段仍失败，只有用户确认才尝试不带图片和关联文件的备份。
- 在「选择备份文件」中选择新版分段包，输入原导出密码、核对分类后恢复。旧版 `.naisrescue` 仅保全旧偏好文件，不含原图，不能作为完整备份导入。
- 移动端打开备份目录选择器前不再先读取旧设置；保存新目录仍需应用数据可读。其他平台不加入 Android 专用的分段导出回退。
- Android 原故障设备未进行带真实数据的覆盖安装与恢复。请先保留现有备份，不要为了升级卸载旧版或清除应用数据。
- iOS 附件为未签名 IPA，需自行签名，不能直接安装到普通 iPhone；不是 App Store 或 TestFlight 发行。其他平台安装与更新条件以 Latest 为准。
