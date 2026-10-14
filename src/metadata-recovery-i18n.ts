import type { AppLanguage } from "./types";

export type MetadataRecoveryText = {
  mode: string;
  online: string;
  offline: string;
  onlinePrivacy: string;
  offlinePrivacy: string;
  onlineSummary: string;
  reading: string;
  onlineFailed: string;
  offlineFailed: string;
  retry: string;
  chooseOffline: string;
  preferenceNotSaved: string;
  mappingWrapper: string;
};

const TEXT: Record<AppLanguage, MetadataRecoveryText> = {
  "zh-CN": {
    mode: "读取模式", online: "联网 · 官方解析器（默认）", offline: "完全离线 · 本地解析器",
    onlinePrivacy: "联网只下载官方解析器及其运行资源；图片始终在本机读取，不上传图片，不调用付费生成。当前联网读取支持 PNG/WebP；JPEG 请选择完全离线。",
    offlinePrivacy: "本次元数据读取完全离线使用内置解析器，不下载官方资源，也不发送网络请求；部分特殊元数据可能无法读取。",
    onlineSummary: "零积分 · 图片不上传 · 仅联网加载解析器",
    reading: "正在读取图片原数据…",
    onlineFailed: "官方解析器未能加载或读取这张图片。未自动切换模式；可重试，或手动选择完全离线。",
    offlineFailed: "本地解析器无法读取这张图片。请检查原图是否完整；部分格式或超限元数据不受支持。",
    retry: "重试当前模式", chooseOffline: "改用完全离线",
    preferenceNotSaved: "模式已在当前会话生效，但无法保存到本机；下次打开可能恢复默认联网。",
    mappingWrapper: "Comment 包装仅用于兼容参数回填，不是新增的官方原始字段；下方原始数据保留官方返回的字段和 JSON 类型。",
  },
  "zh-TW": {
    mode: "讀取模式", online: "連網 · 官方解析器（預設）", offline: "完全離線 · 本機解析器",
    onlinePrivacy: "連網只下載官方解析器及其執行資源；圖片始終在本機讀取，不上傳圖片，不呼叫付費生成。目前連網讀取支援 PNG/WebP；JPEG 請選擇完全離線。",
    offlinePrivacy: "本次中繼資料讀取完全離線使用內建解析器，不下載官方資源，也不傳送網路請求；部分特殊中繼資料可能無法讀取。",
    onlineSummary: "零積分 · 圖片不上傳 · 僅連網載入解析器",
    reading: "正在讀取圖片原始資料…",
    onlineFailed: "官方解析器無法載入或讀取這張圖片。未自動切換模式；可重試，或手動選擇完全離線。",
    offlineFailed: "本機解析器無法讀取這張圖片。請檢查原圖是否完整；部分格式或超限中繼資料不受支援。",
    retry: "重試目前模式", chooseOffline: "改用完全離線",
    preferenceNotSaved: "模式已在目前工作階段生效，但無法儲存到本機；下次開啟可能恢復預設連網。",
    mappingWrapper: "Comment 包裝僅用於相容參數回填，不是新增的官方原始欄位；下方原始資料保留官方傳回的欄位與 JSON 型別。",
  },
  "en-US": {
    mode: "Read mode", online: "Online · official parser (default)", offline: "Fully offline · built-in parser",
    onlinePrivacy: "Online mode only downloads the official parser and its runtime assets. Images stay on this device: no image upload or paid generation. Online reading currently supports PNG/WebP; select fully offline for JPEG.",
    offlinePrivacy: "This metadata read uses the built-in parser fully offline, with no official downloads or network requests. Some special metadata may not be readable.",
    onlineSummary: "0 Anlas · no image upload · parser downloads only",
    reading: "Reading image metadata…",
    onlineFailed: "The official parser could not load or read this image. The mode was not changed automatically; retry or manually select fully offline.",
    offlineFailed: "The built-in parser could not read this image. Check the original file; some formats or oversized metadata are unsupported.",
    retry: "Retry current mode", chooseOffline: "Switch to fully offline",
    preferenceNotSaved: "The mode is active for this session, but could not be saved locally. The next session may use the online default.",
    mappingWrapper: "A Comment envelope is only an adapter for applying compatible settings, not a new original official field. The raw data below preserves the official returned fields and JSON types.",
  },
  "ja-JP": {
    mode: "読み取りモード", online: "オンライン · 公式パーサー（既定）", offline: "完全オフライン · 内蔵パーサー",
    onlinePrivacy: "通信するのは公式パーサーと実行用リソースの取得だけです。画像は端末内で読み取り、アップロードも有料生成も行いません。現在のオンライン読み取りは PNG/WebP に対応しています。JPEG は完全オフラインを選択してください。",
    offlinePrivacy: "今回のメタデータ読み取りは内蔵パーサーで完全オフライン処理し、公式リソースの取得や通信を行いません。一部の特殊なメタデータは読めない場合があります。",
    onlineSummary: "Anlas 0 · 画像送信なし · パーサーの取得のみ",
    reading: "画像の元データを読み取り中…",
    onlineFailed: "公式パーサーの取得または画像の読み取りに失敗しました。モードは自動変更していません。再試行するか、完全オフラインを選択してください。",
    offlineFailed: "内蔵パーサーで画像を読み取れません。元ファイルを確認してください。一部形式や大きすぎるメタデータには対応していません。",
    retry: "現在のモードで再試行", chooseOffline: "完全オフラインに切り替え",
    preferenceNotSaved: "モードは今回のセッションで有効ですが、端末に保存できませんでした。次回は既定のオンラインに戻る場合があります。",
    mappingWrapper: "Comment のラッパーは互換設定を適用するためだけのもので、公式の元フィールドを追加するものではありません。下の元データは公式が返したフィールドと JSON 型を保持します。",
  },
  "ko-KR": {
    mode: "읽기 모드", online: "온라인 · 공식 파서(기본)", offline: "완전 오프라인 · 내장 파서",
    onlinePrivacy: "온라인 모드는 공식 파서와 실행 리소스만 다운로드합니다. 이미지는 기기에서만 읽으며 업로드나 유료 생성을 하지 않습니다. 현재 온라인 읽기는 PNG/WebP를 지원합니다. JPEG는 완전 오프라인을 선택하세요.",
    offlinePrivacy: "이번 메타데이터 읽기는 공식 리소스 다운로드나 네트워크 요청 없이 내장 파서로 완전 오프라인 처리합니다. 일부 특수 메타데이터는 읽지 못할 수 있습니다.",
    onlineSummary: "Anlas 0 · 이미지 업로드 없음 · 파서만 다운로드",
    reading: "이미지 원본 데이터를 읽는 중…",
    onlineFailed: "공식 파서를 불러오거나 이미지를 읽지 못했습니다. 모드를 자동 변경하지 않았습니다. 다시 시도하거나 완전 오프라인을 직접 선택하세요.",
    offlineFailed: "내장 파서로 이미지를 읽을 수 없습니다. 원본 파일을 확인하세요. 일부 형식이나 너무 큰 메타데이터는 지원되지 않습니다.",
    retry: "현재 모드로 다시 시도", chooseOffline: "완전 오프라인으로 전환",
    preferenceNotSaved: "모드는 현재 세션에 적용되었지만 기기에 저장하지 못했습니다. 다음 세션에서는 기본 온라인 모드로 돌아갈 수 있습니다.",
    mappingWrapper: "Comment 래퍼는 호환 설정 적용을 위한 어댑터일 뿐, 새로운 공식 원본 필드가 아닙니다. 아래 원본 데이터는 공식 반환 필드와 JSON 타입을 유지합니다.",
  },
};

const HISTORY_STATUS = {
  "zh-CN": { historyNotLoaded: "未加载", historyUnavailable: "读取失败", historyRetry: "重新读取历史与分组", historyGroupsFailed: "分组列表读取失败，已显示全部历史图片；可重试分组。" },
  "zh-TW": { historyNotLoaded: "尚未載入", historyUnavailable: "讀取失敗", historyRetry: "重新讀取歷史與分組", historyGroupsFailed: "分組清單讀取失敗，已顯示全部歷史圖片；可重試分組。" },
  "en-US": { historyNotLoaded: "Not loaded", historyUnavailable: "Unavailable", historyRetry: "Reload history and groups", historyGroupsFailed: "Group loading failed. All history images are shown; retry to reload groups." },
  "ja-JP": { historyNotLoaded: "未読み込み", historyUnavailable: "読み込み失敗", historyRetry: "履歴とグループを再読み込み", historyGroupsFailed: "グループの読み込みに失敗したため、すべての履歴画像を表示しています。再試行できます。" },
  "ko-KR": { historyNotLoaded: "미로드", historyUnavailable: "읽기 실패", historyRetry: "기록과 그룹 다시 불러오기", historyGroupsFailed: "그룹을 불러오지 못해 전체 기록 이미지를 표시합니다. 다시 시도할 수 있습니다." },
} as const;
export function metadataRecoveryText(language: AppLanguage): MetadataRecoveryText & typeof HISTORY_STATUS[AppLanguage] {
  return { ...TEXT[language], ...HISTORY_STATUS[language] };
}
