import 'app_locales.dart';

String comicProviderText(Object? language, String key) {
  const texts = <String, List<String>>{
    'title': [
      '漫画 · 兼容图片服务',
      '漫畫 · 相容圖片服務',
      'Comic · Compatible image service',
      '漫画 · 互換画像サービス',
      '만화 · 호환 이미지 서비스'
    ],
    'rules': [
      '每格发送“全局风格 + 分镜提示词”。统一尺寸使用图片服务配置，逐格尺寸使用分镜选择。仅发送服务中明确配置的扩展参数；不套用 NovelAI 模型、种子、采样器或负面提示词。',
      '每格傳送「全域風格 + 分鏡提示詞」。統一尺寸使用服務設定，逐格尺寸使用分鏡選擇。僅傳送明確設定的擴充參數，不套用 NovelAI 模型、種子、採樣器或負面提示詞。',
      'Each panel sends global style + panel prompt. Uniform size uses the service configuration; per-panel size uses the panel selection. Only explicitly configured gateway extensions are sent, not NovelAI model, seed, sampler or negative prompt controls.',
      '各コマは全体スタイル＋コマのプロンプトを送信します。統一サイズはサービス設定、個別サイズはコマの選択を使用。明示した拡張パラメータのみを送信し、NovelAI のモデル・シード・サンプラー・ネガティブ設定は適用しません。',
      '각 컷은 공통 스타일과 컷 프롬프트를 전송합니다. 공통 크기는 서비스 설정, 개별 크기는 컷 선택을 사용합니다. 명시한 확장 매개변수만 전송하며 NovelAI 모델·시드·샘플러·부정 프롬프트는 적용하지 않습니다.'
    ],
    'references': [
      '当前接口未接入参考图。已有参考配置保留；本批有启用参考时将停止，不会忽略参考偷偷生成。可移除/禁用本批参考，或切回 NovelAI。',
      '目前介面未接入參考圖。保留既有設定；本批有啟用參考時停止，不會忽略參考生成。可移除/停用本批參考或切回 NovelAI。',
      'Reference inputs are not supported by this endpoint. Existing configuration is retained; panels with active references stop rather than silently ignore them. Remove/disable references for this batch or switch to NovelAI.',
      'このエンドポイントは参照画像に未対応です。既存設定は保持し、有効な参照があるコマは無視せず停止します。参照を解除するか NovelAI に切り替えてください。',
      '이 엔드포인트는 참조 이미지를 지원하지 않습니다. 기존 설정을 보존하며 활성 참조가 있으면 무시하지 않고 중지합니다. 이번 작업의 참조를 해제하거나 NovelAI로 전환하세요.'
    ],
    'billing': [
      '费用以图片服务商为准，不计为 0 Anlas；整批确认一次，失败停止，已保存图片保留。',
      '費用以圖片服務商為準，不視為 0 Anlas；整批確認一次，失敗停止，保留已儲存圖片。',
      'Provider billing applies, not a zero-Anlas quote. Confirm once for the batch; stop on failure and retain saved images.',
      '料金は画像サービス側で決まります。0 Anlasとは表示しません。一括確認は一度で、失敗時は停止し保存済み画像を保持します。',
      '요금은 이미지 서비스 기준이며 0 Anlas로 표시하지 않습니다. 일괄 한 번 확인하고 실패 시 중지하며 저장된 이미지를 보존합니다.'
    ],
    'settings': [
      '配置服务 / 切换模型',
      '設定服務 / 切換模型',
      'Configure service / model',
      'サービス・モデル設定',
      '서비스 / 모델 설정'
    ],
  };
  final code = normalizeAppLocaleCode(language);
  final index = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'].indexOf(code);
  return texts[key]?[index < 0 ? 0 : index] ?? key;
}
