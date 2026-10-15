import 'app_locales.dart';

/// Only for a selected account whose explicit profile method is relay.
({String actualUnknown, String reference, String noSharedOpus})
    relayAnlasBillingText(Object? language, int? amount) {
  final value = amount?.toString() ?? '?';
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW': return (
      actualUnknown: '中轉實際扣費：未知',
      reference: '官方無訂閱優惠參考：$value Anlas（估算，非中轉帳單）',
      noSharedOpus: '官方 Opus 優惠不與獨立中轉帳號共享。');
    case 'en-US': return (
      actualUnknown: 'Relay actual charge: unknown',
      reference: 'Official no-subscription-discount reference: $value Anlas (estimate, not a relay bill)',
      noSharedOpus: 'Official Opus benefits are not shared with independent relay accounts.');
    case 'ja-JP': return (
      actualUnknown: '中継の実際の請求：不明',
      reference: '公式のサブスク割引なし参考：$value Anlas（推定、中継の請求額ではありません）',
      noSharedOpus: '公式 Opus の特典は独立した中継アカウントと共有されません。');
    case 'ko-KR': return (
      actualUnknown: '중계 실제 청구: 알 수 없음',
      reference: '공식 구독 할인 없는 참고: $value Anlas (추정, 중계 청구액 아님)',
      noSharedOpus: '공식 Opus 혜택은 독립 중계 계정과 공유되지 않습니다.');
    default: return (
      actualUnknown: '中转实际扣费：未知',
      reference: '官方无订阅优惠参考：$value Anlas（估算，非中转账单）',
      noSharedOpus: '官方 Opus 优惠不与独立中转账号共享。');
  }
}

String anlasPreviewHeading(Object? language, {required bool official}) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW': return official ? '生成前官方報價（非實際扣費）' : '生成前估算（非實際扣費）';
    case 'en-US': return official ? 'Official pre-generation quote (not an actual charge)' : 'Pre-generation estimate (not an actual charge)';
    case 'ja-JP': return official ? '生成前の公式見積もり（実際の請求ではありません）' : '生成前の推定（実際の請求ではありません）';
    case 'ko-KR': return official ? '생성 전 공식 견적 (실제 청구 아님)' : '생성 전 추정 (실제 청구 아님)';
    default: return official ? '生成前官方报价（非实际扣费）' : '生成前估算（非实际扣费）';
  }
}
