import 'dart:io';

import 'package:file_picker/file_picker.dart';

import '../i18n/app_locales.dart';
import '../state/app_state.dart';
import 'storage_permission.dart';

typedef OnlineGalleryDownloadPathText = ({
  String title,
  String defaultLabel,
  String hint,
  String choose,
  String reset,
  String dialogTitle,
});

OnlineGalleryDownloadPathText onlineGalleryDownloadPathText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return (title: '線上畫廊下載路徑', defaultLabel: '首次下載時選擇', hint: '首次下載會詢問儲存位置，之後自動沿用；單圖與整個系列共用。', choose: '選擇資料夾', reset: '下次重新詢問', dialogTitle: '選擇線上畫廊下載資料夾');
    case 'en-US':
      return (title: 'Online gallery download folder', defaultLabel: 'Choose on first download', hint: 'The first download asks for a folder, then reuses it for single images and full series.', choose: 'Choose folder', reset: 'Ask next time', dialogTitle: 'Choose online gallery download folder');
    case 'ja-JP':
      return (title: 'オンラインギャラリー保存先', defaultLabel: '初回保存時に選択', hint: '初回保存時に場所を確認し、以降は単体・シリーズ保存で同じ場所を使用します。', choose: 'フォルダーを選択', reset: '次回もう一度確認', dialogTitle: 'オンラインギャラリー保存先を選択');
    case 'ko-KR':
      return (title: '온라인 갤러리 저장 폴더', defaultLabel: '첫 저장 시 선택', hint: '첫 저장 때 위치를 묻고 이후 단일 이미지와 전체 시리즈에 같은 폴더를 사용합니다.', choose: '폴더 선택', reset: '다음에 다시 묻기', dialogTitle: '온라인 갤러리 저장 폴더 선택');
    default:
      return (title: '在线画廊下载路径', defaultLabel: '首次下载时选择', hint: '第一次下载会询问保存位置，以后单张图片和整个系列都默认使用该路径。', choose: '选择文件夹', reset: '下次重新询问', dialogTitle: '选择在线画廊下载文件夹');
  }
}

Future<bool> ensureOnlineGalleryDownloadDirectory(AppState state) async {
  if (state.settings.onlineGalleryDownloadDir.trim().isNotEmpty) return true;
  final text = onlineGalleryDownloadPathText(state.settings.language);
  final picked = await FilePicker.platform.getDirectoryPath(dialogTitle: text.dialogTitle);
  if (picked == null || picked.trim().isEmpty) return false;
  if (Platform.isAndroid && !await StoragePermission.hasAllFilesAccess()) {
    await StoragePermission.requestAllFilesAccess();
  }
  await state.setSettings((settings) => settings.onlineGalleryDownloadDir = picked.trim());
  return true;
}
