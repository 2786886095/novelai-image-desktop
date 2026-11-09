# Android 分段救援导出（候选）

- 手动「导出所选数据」和「立即完整备份」在 Android 抛出可捕获的 OOM 时进入此流程。正常备份、不相关错误、iOS、后台自动备份不走救援。
- 以 256 KiB 分段读取旧版偏好 XML 和存在的 .bak，不调用 SharedPreferences，也不解开原文件的内容。临时密文以 AES-256-GCM 认证；密钥由 600,000 轮 PBKDF2-HMAC-SHA-256 和随机盐导出。密码不会落盘。保存后重新读取用户选择的 Android 文档，对比字节数与 SHA-256。
- .naisrescue 是仅含旧版偏好文件的救援包，不是 .naisbackup。它不含图片文件、独立工作区文件或 Android Keystore。数据类型不足时禁止将它当作完整备份。
- 可在可信电脑、项目 mobile 目录运行 `dart run tool/preferences_rescue.dart verify ARCHIVE` 或 `dart run tool/preferences_rescue.dart extract ARCHIVE NEW_DIRECTORY`。交互输入密码，提取到新目录后仍是敏感明文；不会覆盖现有目录，也不会导入手机或重写原数据。
- 被 Android 直接杀进程而没有机会捕获错误时，应用不能自动切换。不要为安装测试包卸载正式版。正式数据上的覆盖安装还需同包名及兼容签名，且必须验证。
