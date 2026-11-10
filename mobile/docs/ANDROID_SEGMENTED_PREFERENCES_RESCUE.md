# Android 分段备份与旧偏好救援

- 完整备份优先。手动导出遇到可捕获的内存不足时才启用低内存 ZIP 写入和加密分段备份（`.naisparts`）。分段失败后，只有用户确认才尝试省略图片和关联文件。
- 在「选择备份文件」中选中 `.naisparts`，输入导出密码后预览分类；确认后使用相同密码导入。校验失败不会把未验证的数据交给 ZIP 导入器。
- `.naisrescue` 只包含旧偏好 XML 和存在的 .bak，不含原图、独立工作区或 Android Keystore。它不能作为常规备份导入。若旧偏好本身无法载入，分段不能凭空生成完整备份。
- 可信电脑可在项目 mobile 目录运行 `dart run tool/preferences_rescue.dart verify ARCHIVE` 或 `dart run tool/preferences_rescue.dart extract ARCHIVE NEW_DIRECTORY`。交互输入密码，提取到新目录的明文可能敏感；不会写入手机或覆盖现有目录。
- Android 如果直接杀掉进程，应用不能自动切换导出方式。不要卸载正式版或清除应用数据。
