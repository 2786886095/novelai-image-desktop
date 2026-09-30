const zh = {
  changed: "配置已在其他入口修改。重新读取后再编辑，避免覆盖新配置。", reload: "重新读取配置（替换本页草稿）",
  title: "文生图服务", current: "当前：", native: "NovelAI 原生", config: "兼容图片服务配置",
  scope: "兼容服务使用独立密钥。仅接管普通文生图；重绘、增强、参考图及画风实验室仍使用 NovelAI。费用以对应服务商为准。",
  switchNative: "切回 NovelAI 原生", switched: "已切回 NovelAI；兼容服务配置保留。", switchFailed: "切换未保存，请重试。",
  setup: "配置 OpenAI Images 兼容接口 / New API", url: "图片 API URL",
  urlHelp: "支持基础地址或完整 /images/generations 路径；版本路径（如 /v1）按服务商要求填写。",
  key: "独立图片 API Key", show: "显示密钥", hide: "隐藏密钥", model: "模型名称", modelHint: "填写服务商提供的模型 ID",
  size: "图片尺寸", sizeHint: "1024x1024 或 auto", sizeHelp: "可用尺寸由所选模型决定，不套用 NovelAI 尺寸限制。",
  format: "返回格式", auto: "自动（不发送 response_format）", extensions: "可选网关扩展参数（JSON）",
  extensionHelp: "默认留空对象。仅支持 negative_prompt、steps、scale、sampler、seed；请确认服务商支持后再填写。",
  saving: "保存中…", save: "保存并使用兼容图片服务", saved: "图片服务配置已保存；尚未发送生成请求。",
  invalid: "配置未保存，请检查地址、密钥、模型、尺寸、JSON 扩展参数和本机密钥存储状态。",
  privacy: "保存不发送收费请求。请求使用“AI 服务”代理设置；不会把 NovelAI Token 发送到此地址。",
  panel: "OpenAI Images 兼容文生图", missingModel: "未配置模型", missingSize: "未配置尺寸", prompt: "图片提示词", count: "本次图片数（一次请求）",
  requestHelp: "提交一次请求，不自动重试。数量、尺寸与费用由服务商决定；失败前已返回的有效图片会保存。",
  controlsHelp: "此模式仅发送上方提示词、配置的尺寸及扩展参数，不使用 NovelAI 的风格预设、角色分段或参考图。",
  settings: "配置服务 / 切换回 NovelAI", stop: "停止请求", generate: "生成图片",
};
const en: typeof zh = {
  changed: "Settings changed elsewhere. Reload before editing to avoid overwriting the newer settings.", reload: "Reload settings (replace this draft)",
  title: "Text-to-image service", current: "Current: ", native: "Native NovelAI", config: "Compatible image service settings",
  scope: "Uses a separate key for ordinary text-to-image only. Redraw, enhancement, references and the style lab still use NovelAI. Billing is determined by the respective provider.",
  switchNative: "Switch to native NovelAI", switched: "Switched to NovelAI; compatible settings retained.", switchFailed: "Could not save the switch. Try again.",
  setup: "Configure OpenAI Images compatibility / New API", url: "Image API URL", urlHelp: "Accepts a base URL or full /images/generations path. Include the version path (e.g. /v1) required by your provider.",
  key: "Separate image API key", show: "Show key", hide: "Hide key", model: "Model name", modelHint: "Enter the model ID supplied by your provider",
  size: "Image size", sizeHint: "1024x1024 or auto", sizeHelp: "Available sizes depend on the model, not NovelAI limits.",
  format: "Response format", auto: "Auto (omit response_format)", extensions: "Optional gateway extensions (JSON)", extensionHelp: "Leave {} by default. Supports only negative_prompt, steps, scale, sampler and seed; check provider support first.",
  saving: "Saving…", save: "Save and use compatible image service", saved: "Image service saved; no generation request sent.", invalid: "Not saved. Check the address, key, model, size, JSON extensions and local credential storage.",
  privacy: "Saving sends no paid request. Uses the AI service proxy settings; your NovelAI token is never sent to this endpoint.",
  panel: "OpenAI Images compatible generation", missingModel: "Model not configured", missingSize: "Size not configured", prompt: "Image prompt", count: "Images in this request",
  requestHelp: "One request, no automatic retries. Supported counts, sizes and charges depend on the provider. Valid partial images are saved.",
  controlsHelp: "Sends only this prompt, the configured size and extensions. NovelAI styles, character sections and references are not used.",
  settings: "Configure service / switch to NovelAI", stop: "Stop request", generate: "Generate images",
};
const tw: typeof zh = {
  changed: "設定已在其他入口修改。請重新讀取後再編輯，避免覆寫新設定。", reload: "重新讀取設定（替換本頁草稿）",
  title:"文生圖服務",current:"目前：",native:"NovelAI 原生",config:"相容圖片服務設定",scope:"相容服務使用獨立金鑰，僅接管一般文生圖；重繪、增強、參考圖與畫風實驗室仍使用 NovelAI，費用以各服務商為準。",switchNative:"切回 NovelAI 原生",switched:"已切回 NovelAI；保留相容服務設定。",switchFailed:"切換未儲存，請重試。",setup:"設定 OpenAI Images 相容介面 / New API",url:"圖片 API URL",urlHelp:"支援基礎網址或完整 /images/generations 路徑；版本路徑（如 /v1）請依服務商要求填寫。",key:"獨立圖片 API Key",show:"顯示金鑰",hide:"隱藏金鑰",model:"模型名稱",modelHint:"填寫服務商提供的模型 ID",size:"圖片尺寸",sizeHint:"1024x1024 或 auto",sizeHelp:"可用尺寸由模型決定，不套用 NovelAI 限制。",format:"回傳格式",auto:"自動（不傳送 response_format）",extensions:"選填閘道擴充參數（JSON）",extensionHelp:"預設保留 {}。僅支援 negative_prompt、steps、scale、sampler、seed；請先確認服務商支援。",saving:"儲存中…",save:"儲存並使用相容圖片服務",saved:"圖片服務已儲存；尚未傳送生成請求。",invalid:"未儲存，請檢查網址、金鑰、模型、尺寸、JSON 參數與本機金鑰儲存狀態。",privacy:"儲存不會傳送付費請求。使用 AI 服務代理設定，不會將 NovelAI Token 傳送至此網址。",panel:"OpenAI Images 相容文生圖",missingModel:"未設定模型",missingSize:"未設定尺寸",prompt:"圖片提示詞",count:"本次圖片數（一次請求）",requestHelp:"只提交一次請求，不自動重試。數量、尺寸與費用由服務商決定；有效的部分圖片仍會儲存。",controlsHelp:"此模式僅傳送上方提示詞、設定的尺寸與擴充參數，不使用 NovelAI 風格預設、角色分段或參考圖。",settings:"設定服務 / 切回 NovelAI",stop:"停止請求",generate:"生成圖片",
};
const ja: typeof zh = {
  changed: "別の画面で設定が変更されました。新しい設定を上書きしないよう、再読み込みしてから編集してください。", reload: "設定を再読み込み（この下書きを置換）",
  title:"画像生成サービス",current:"現在：",native:"NovelAI ネイティブ",config:"互換画像サービス設定",scope:"通常のテキスト画像生成に独立したキーを使用します。再描画・強化・参照画像・画風ラボは NovelAI のままです。料金は各サービスで確認してください。",switchNative:"NovelAI に切り替え",switched:"NovelAI に切り替えました。互換設定は保持しています。",switchFailed:"切り替えを保存できませんでした。",setup:"OpenAI Images 互換 / New API の設定",url:"画像 API URL",urlHelp:"ベース URL または完全な /images/generations パスに対応。/v1 などのバージョンは提供元の指定どおり入力してください。",key:"独立した画像 API キー",show:"キーを表示",hide:"キーを隠す",model:"モデル名",modelHint:"提供元のモデル ID",size:"画像サイズ",sizeHint:"1024x1024 または auto",sizeHelp:"対応サイズはモデルに依存し、NovelAI の制限は適用しません。",format:"応答形式",auto:"自動（response_format を省略）",extensions:"任意のゲートウェイ拡張（JSON）",extensionHelp:"既定は {}。negative_prompt、steps、scale、sampler、seed のみ対応。提供元の対応状況を確認してください。",saving:"保存中…",save:"保存して互換画像サービスを使用",saved:"保存しました。生成リクエストは送信していません。",invalid:"未保存です。URL、キー、モデル、サイズ、JSON とローカルのキー保存状態を確認してください。",privacy:"保存時に有料リクエストは送信しません。AI サービスのプロキシ設定を使用し、NovelAI Token は送信しません。",panel:"OpenAI Images 互換画像生成",missingModel:"モデル未設定",missingSize:"サイズ未設定",prompt:"画像プロンプト",count:"今回の画像数（1 回のリクエスト）",requestHelp:"送信は 1 回のみ、自動再試行なし。枚数・サイズ・料金は提供元によります。有効な部分結果は保存します。",controlsHelp:"上記プロンプト、設定サイズ、拡張パラメータのみ送信します。NovelAI の画風、キャラクター区分、参照画像は使用しません。",settings:"サービス設定 / NovelAI に切り替え",stop:"リクエストを停止",generate:"画像を生成",
};
const ko: typeof zh = {
  changed: "다른 곳에서 설정이 변경되었습니다. 새 설정을 덮어쓰지 않도록 다시 불러온 후 편집하세요.", reload: "설정 다시 불러오기 (현재 초안 교체)",
  title:"이미지 생성 서비스",current:"현재: ",native:"NovelAI 기본",config:"호환 이미지 서비스 설정",scope:"일반 텍스트 이미지 생성에 별도 키를 사용합니다. 다시 그리기, 향상, 참조 이미지 및 스타일 실험실은 NovelAI를 사용하며 요금은 각 제공업체 기준입니다.",switchNative:"NovelAI로 전환",switched:"NovelAI로 전환했습니다. 호환 설정은 유지됩니다.",switchFailed:"전환을 저장하지 못했습니다.",setup:"OpenAI Images 호환 / New API 설정",url:"이미지 API URL",urlHelp:"기본 URL 또는 전체 /images/generations 경로를 지원합니다. /v1 등 버전 경로는 제공업체 지침에 맞추세요.",key:"별도 이미지 API 키",show:"키 표시",hide:"키 숨기기",model:"모델 이름",modelHint:"제공업체의 모델 ID 입력",size:"이미지 크기",sizeHint:"1024x1024 또는 auto",sizeHelp:"지원 크기는 모델에 따라 다르며 NovelAI 제한을 적용하지 않습니다.",format:"응답 형식",auto:"자동 (response_format 생략)",extensions:"선택적 게이트웨이 확장 (JSON)",extensionHelp:"기본값은 {}입니다. negative_prompt, steps, scale, sampler, seed만 지원하며 제공업체 지원 여부를 확인하세요.",saving:"저장 중…",save:"저장 후 호환 이미지 서비스 사용",saved:"저장했습니다. 생성 요청은 보내지 않았습니다.",invalid:"저장하지 못했습니다. 주소, 키, 모델, 크기, JSON 및 로컬 키 저장 상태를 확인하세요.",privacy:"저장 시 유료 요청을 보내지 않습니다. AI 서비스 프록시 설정을 사용하며 NovelAI Token은 이 주소에 전송하지 않습니다.",panel:"OpenAI Images 호환 이미지 생성",missingModel:"모델 미설정",missingSize:"크기 미설정",prompt:"이미지 프롬프트",count:"이번 요청의 이미지 수",requestHelp:"한 번만 요청하고 자동 재시도하지 않습니다. 수량, 크기, 요금은 제공업체 기준입니다. 유효한 부분 결과는 저장합니다.",controlsHelp:"위 프롬프트, 설정된 크기 및 확장만 전송합니다. NovelAI 스타일, 캐릭터 구분 및 참조 이미지는 사용하지 않습니다.",settings:"서비스 설정 / NovelAI로 전환",stop:"요청 중지",generate:"이미지 생성",
};
export function compatibleImageText(language: unknown): typeof zh {
  return ({ "zh-CN": zh, "zh-TW": tw, "en-US": en, "ja-JP": ja, "ko-KR": ko } as Record<string, typeof zh>)[String(language)] ?? en;
}
