# 发行说明

## Latest — Android 旧数据备份内存不足修复

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main)

- Android 读取整份旧偏好文件遇到内存不足时，分段备份改用逐项只读提取，不再依赖整份文件载入。未达到大小限制的所选数据仍可备份。
- 单条记录过大或旧格式无法安全处理时，提示对应类别，不会静默漏项；可取消该类别后重试。备份不改写旧文件，也不替代启动数据迁移。
- 以约 170 MiB 的合成旧数据验证了设置与工作区的导出和恢复；报告故障的实体手机和原数据未实测。升级时不要卸载旧版或清除应用数据。
- iOS 附件为未签名 IPA，需自行签名，不能直接安装到普通 iPhone；不是 App Store 或 TestFlight 发行。
- Windows 画风迭代的本机 GPU 实测未验收；不计为通过。
