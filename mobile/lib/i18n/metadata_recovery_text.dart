import 'app_locales.dart';

class MetadataRecoveryText {
  final String label, online, offline, onlineInfo, offlineInfo, onlineFailure, retry;
  const MetadataRecoveryText(this.label, this.online, this.offline,
      this.onlineInfo, this.offlineInfo, this.onlineFailure, this.retry);
}

MetadataRecoveryText metadataRecoveryText(Object? language) => switch (normalizeAppLocaleCode(language)) {
  'zh-TW' => const MetadataRecoveryText('原始資料恢復方式', '聯網：官方解析器（預設）', '離線：本機解析器',
      '聯網只下載官方解析器；圖片在本機讀取，不上傳。PNG / WebP 可聯網，JPEG 請明確選擇離線。',
      '離線讀取：不發送網路請求、不呼叫 AI、不消耗 Anlas。',
      '聯網恢復失敗，未切換離線。請重試或明確選擇離線。', '重試'),
  'en-US' => const MetadataRecoveryText('Metadata recovery mode', 'Online: official parser (default)', 'Offline: local parser',
      'Only the official parser is downloaded. Images stay on this device and are not uploaded. Online supports PNG / WebP; select offline for JPEG.',
      'Offline: no network request, no AI call, no Anlas cost.',
      'Online recovery failed; no offline fallback. Retry or explicitly select offline.', 'Retry'),
  'ja-JP' => const MetadataRecoveryText('元データの復元方法', 'オンライン：公式解析器（既定）', 'オフライン：端末内解析',
      '公式解析器だけをダウンロードします。画像は端末内で読み取り、送信しません。PNG / WebP はオンライン、JPEG はオフラインを選択してください。',
      'オフライン：通信・AI 呼び出し・Anlas 消費なし。',
      'オンライン復元に失敗しました。自動切替なし。再試行またはオフラインを選択してください。', '再試行'),
  'ko-KR' => const MetadataRecoveryText('원본 데이터 복원 방식', '온라인: 공식 파서 (기본)', '오프라인: 로컬 파서',
      '공식 파서만 다운로드합니다. 이미지는 기기에서 읽으며 업로드하지 않습니다. PNG / WebP는 온라인, JPEG는 오프라인을 선택하세요.',
      '오프라인: 네트워크 요청, AI 호출, Anlas 소비 없음.',
      '온라인 복원 실패. 자동 오프라인 전환 없음. 다시 시도하거나 오프라인을 선택하세요.', '다시 시도'),
  _ => const MetadataRecoveryText('原数据恢复方式', '联网：官方解析器（默认）', '离线：本机解析器',
      '联网只下载官方解析器；图片在本机读取，不上传。PNG / WebP 可联网，JPEG 请明确选择离线。',
      '离线读取：不发送网络请求、不调用 AI、不消耗 Anlas。',
      '联网恢复失败，未切换离线。请重试或明确选择离线。', '重试'),
};
