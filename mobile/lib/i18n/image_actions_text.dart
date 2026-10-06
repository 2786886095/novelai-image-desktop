import 'app_locales.dart';

String imageActionsText(Object? language, String key) {
  const labels = {
    'en-US': [
      'Paste image',
      'Copy image',
      'Image copied',
      'Image clipboard is unavailable on this platform.',
      'Copy with original metadata',
      'Off by default. When on, copy the original file bytes, including embedded parameters. Receiving apps may discard metadata.'
    ],
    'zh-CN': [
      '粘贴图片',
      '复制图片',
      '已复制图片',
      '此平台无法复制图片到剪贴板。',
      '复制时保留原始元数据',
      '默认关闭。开启后复制原始文件字节（含内嵌参数）；接收应用可能丢弃元数据。'
    ],
    'zh-TW': [
      '貼上圖片',
      '複製圖片',
      '已複製圖片',
      '此平台無法複製圖片到剪貼簿。',
      '複製時保留原始中繼資料',
      '預設關閉。開啟後複製原始檔案位元組（含內嵌參數）；接收應用可能丟棄中繼資料。'
    ],
    'ja-JP': [
      '画像を貼り付け',
      '画像をコピー',
      '画像をコピーしました',
      'この端末では画像クリップボードを利用できません。',
      '元のメタデータ付きでコピー',
      '初期状態はオフ。有効時は埋め込みパラメータを含む元ファイルをコピーします。受信アプリがメタデータを削除する場合があります。'
    ],
    'ko-KR': [
      '이미지 붙여넣기',
      '이미지 복사',
      '이미지 복사됨',
      '이 플랫폼에서는 이미지 클립보드를 사용할 수 없습니다.',
      '원본 메타데이터와 함께 복사',
      '기본값은 꺼짐. 켜면 내장 매개변수를 포함한 원본 파일을 복사합니다. 받는 앱이 메타데이터를 제거할 수 있습니다.'
    ],
  };
  const keys = [
    'paste',
    'copy',
    'copied',
    'unsupported',
    'originalTitle',
    'originalHint'
  ];
  final index = keys.indexOf(key);
  return index < 0 ? key : labels[normalizeAppLocaleCode(language)]![index];
}
