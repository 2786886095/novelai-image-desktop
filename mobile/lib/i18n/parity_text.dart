import 'app_locales.dart';

String parityText(Object? locale, String key) {
  const words = {
    'sound': ['提示音', '提示音', 'Sounds', '通知音', '알림음'],
    'enabled': [
      '生成完成提示音',
      '生成完成提示音',
      'Generation completion sound',
      '生成完了の通知音',
      '생성 완료 알림음'
    ],
    'when': [
      '生成页单张或整批任务完成且保存了图片时播放一次；取消或全部失败不播放。',
      '生成頁單張或整批完成且儲存圖片時播放一次；取消或全部失敗不播放。',
      'Play once when a generation run saves images. No sound on cancellation or total failure.',
      '生成で画像を保存したとき一度再生。キャンセル・全件失敗時は再生しません。',
      '이미지를 저장한 생성 작업 완료 시 한 번 재생합니다. 취소나 전체 실패 시 재생하지 않습니다.'
    ],
    'volume': ['音量', '音量', 'Volume', '音量', '음량'],
    'custom': [
      '自定义音频：MP3 / WAV / OGG，最多 1 MiB，播放最多 10 秒',
      '自訂音訊：MP3 / WAV / OGG，最多 1 MiB，播放最多 10 秒',
      'Custom audio: MP3 / WAV / OGG, up to 1 MiB; plays at most 10 seconds',
      '音声：MP3 / WAV / OGG、最大 1 MiB・10 秒まで再生',
      '사용자 오디오: MP3 / WAV / OGG, 최대 1 MiB 및 재생 10초'
    ],
    'choose': ['选择音频', '選擇音訊', 'Choose audio', '音声を選択', '오디오 선택'],
    'builtin': [
      '内置双音提示',
      '內建雙音提示',
      'Built-in two-tone sound',
      '内蔵の二音チャイム',
      '기본 두 음 알림'
    ],
    'preview': ['试听', '試聽', 'Preview', '試聴', '미리 듣기'],
    'reset': [
      '恢复内置提示音',
      '恢復內建提示音',
      'Restore built-in sound',
      '内蔵音に戻す',
      '기본 알림음 복원'
    ],
    'audioError': [
      '音频格式、大小或播放失败，请选择有效音频。',
      '音訊格式、大小或播放失敗，請選擇有效音訊。',
      'Invalid size, format, or playback failed. Choose a valid audio file.',
      '音声の形式・サイズが無効、または再生に失敗しました。',
      '크기나 형식이 잘못되었거나 재생에 실패했습니다.'
    ],
    'i2i': [
      '记住图生图参数',
      '記住圖生圖參數',
      'Remember image-to-image settings',
      '画像から画像の設定を記憶',
      '이미지 변환 설정 기억'
    ],
    'i2iHint': [
      '跨次保存强度、噪声、随机种子与尺寸模式；不自动加载旧图片。',
      '跨次儲存強度、雜訊、種子與尺寸模式；不自動載入舊圖片。',
      'Remember strength, noise, seed and size mode; do not auto-load old images.',
      '強度・ノイズ・シード・サイズを保存。以前の画像は自動で読み込みません。',
      '강도, 노이즈, 시드, 크기 모드를 저장합니다. 이전 이미지는 자동으로 열지 않습니다.'
    ],
  };
  final i = switch (normalizeAppLocaleCode(locale)) {
    'zh-TW' => 1,
    'en-US' => 2,
    'ja-JP' => 3,
    'ko-KR' => 4,
    _ => 0
  };
  return words[key]?[i] ?? key;
}
