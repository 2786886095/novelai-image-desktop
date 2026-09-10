export type ImageFailureStage = "proposal" | "generation";

const labels = {
  "zh-CN": {
    repeatAuto: "已沿用当前画面方案，提示词和角色绑定保持不变。",
    repeatConfirm: "已沿用当前画面方案，尚未生图。请点击“确认生成”。",
    awaitingConfirmation: "尚未提交图片请求，请点击右侧“确认生成”。",
    repairPending: "正在修正方案，尚未提交图片请求（最多等待 45 秒）。",
    generationPending: "图片请求已提交，正在等待生图结果。",
    proposalTitle: "本次未提交生图", generationTitle: "图片生成失败",
    invalid: "模型返回的生图方案格式无效，未提交图片生成。请重试回复，原方案仍保留。",
    missing: "模型只返回了文字，没有提供可执行的生图方案，因此没有提交图片生成。请重试回复。",
    empty: "生图服务没有返回任何图片，已标记为失败。请在方案中重试生成。",
    review: "生图方案修正未通过，全自动生成已暂停，未提交图片请求。请检查该消息中的方案及提示，再选择继续。",
    retained: "本条消息和已有图片仍保留。可返回对话查看详情并重试。",
    open: "返回对话", close: "知道了",
  },
  "zh-TW": {
    repeatAuto: "已沿用目前畫面方案，提示詞與角色綁定保持不變。",
    repeatConfirm: "已沿用目前畫面方案，尚未生圖。請點擊「確認生成」。",
    awaitingConfirmation: "尚未提交圖片請求，請點擊右側「確認生成」。",
    repairPending: "正在修正方案，尚未提交圖片請求（最多等待 45 秒）。",
    generationPending: "圖片請求已提交，正在等待生圖結果。",
    proposalTitle: "本次未提交生圖", generationTitle: "圖片生成失敗",
    invalid: "模型傳回的生圖方案格式無效，未提交圖片生成。請重試回覆，原方案仍保留。",
    missing: "模型只傳回文字，沒有提供可執行的生圖方案，因此未提交圖片生成。請重試回覆。",
    empty: "生圖服務沒有傳回任何圖片，已標記為失敗。請在方案中重試生成。",
    review: "生圖方案修正未通過，全自動生成已暫停，未提交圖片請求。請檢查該訊息中的方案及提示，再選擇繼續。",
    retained: "本則訊息及已有圖片仍保留。可返回對話查看詳情並重試。",
    open: "返回對話", close: "知道了",
  },
  "en-US": {
    repeatAuto: "Reusing the current image plan, preserving its prompts and character bindings.",
    repeatConfirm: "Reusing the current image plan. Click Confirm generation to start.",
    awaitingConfirmation: "No image request submitted yet. Click Confirm generation.",
    repairPending: "Repairing the plan; no image request submitted yet (up to 45 seconds).",
    generationPending: "Image request submitted. Waiting for the result.",
    proposalTitle: "Image generation not started", generationTitle: "Image generation failed",
    invalid: "The model returned an invalid image plan. No image request was submitted. Retry the reply; the previous plan is preserved.",
    missing: "The model returned text without an executable image plan. No image request was submitted. Retry the reply.",
    empty: "The image service returned no images. This attempt has been marked as failed. Retry generation from the plan.",
    review: "The image plan could not be repaired. Automatic generation is paused; no image request was submitted. Review the plan and its instructions before continuing.",
    retained: "The message and existing images are preserved. Return to the conversation to review the details and retry.",
    open: "View conversation", close: "Got it",
  },
  "ja-JP": {
    repeatAuto: "現在の画像プランとキャラクターの関連付けを再利用します。",
    repeatConfirm: "現在の画像プランを再利用します。確認ボタンで生成を開始してください。",
    awaitingConfirmation: "画像は未送信です。確認ボタンで生成してください。",
    repairPending: "プランを修正中です。画像は未送信です（最大45秒）。",
    generationPending: "画像生成を送信しました。結果を待っています。",
    proposalTitle: "画像生成は開始されていません", generationTitle: "画像生成に失敗しました",
    invalid: "モデルの画像プランの形式が無効です。画像生成は送信されていません。返信を再試行してください。以前のプランは保持されています。",
    missing: "モデルは文章のみを返し、実行可能な画像プランを返しませんでした。画像生成は送信されていません。返信を再試行してください。",
    empty: "画像サービスから画像が返されませんでした。この試行は失敗として記録されました。プランから生成を再試行してください。",
    review: "画像プランを修正できず、自動生成を一時停止しました。画像リクエストは送信されていません。プランと案内を確認してから続けてください。",
    retained: "メッセージと既存の画像は保持されています。会話に戻って詳細を確認し、再試行できます。",
    open: "会話に戻る", close: "閉じる",
  },
  "ko-KR": {
    repeatAuto: "현재 이미지 계획과 캐릭터 연결을 그대로 재사용합니다.",
    repeatConfirm: "현재 이미지 계획을 재사용합니다. 생성 확인 버튼을 누르세요.",
    awaitingConfirmation: "이미지 요청 전입니다. 생성 확인 버튼을 누르세요.",
    repairPending: "계획 수정 중입니다. 이미지 요청 전입니다(최대 45초).",
    generationPending: "이미지 요청을 전송했습니다. 결과를 기다리고 있습니다.",
    proposalTitle: "이미지 생성을 시작하지 않았습니다", generationTitle: "이미지 생성 실패",
    invalid: "모델이 잘못된 형식의 이미지 계획을 반환했습니다. 이미지 요청은 전송하지 않았습니다. 응답을 다시 시도하세요. 이전 계획은 보존됩니다.",
    missing: "모델이 실행 가능한 이미지 계획 없이 텍스트만 반환했습니다. 이미지 요청은 전송하지 않았습니다. 응답을 다시 시도하세요.",
    empty: "이미지 서비스가 이미지를 반환하지 않아 실패로 기록했습니다. 계획에서 생성을 다시 시도하세요.",
    review: "이미지 계획을 수정하지 못해 자동 생성을 일시 중지했습니다. 이미지 요청은 전송하지 않았습니다. 계획과 안내를 확인한 후 계속하세요.",
    retained: "메시지와 기존 이미지는 보존됩니다. 대화로 돌아가 상세 내용을 확인하고 다시 시도할 수 있습니다.",
    open: "대화로 이동", close: "확인",
  },
};

export function imageOutcomeText(language: unknown) {
  return labels[language as keyof typeof labels] ?? labels["zh-CN"];
}

/** Only explicit creation requests count: ordinary chat and image discussion do not. */
export function explicitlyRequestsImage(text: string) {
  return /(?:^|[。！？!?；;\n])\s*(?:(?:请|請|帮我|幫我|给我|給我|麻烦|再|重新|可以帮我)\s*)*(?:生成(?!的|过|過|了|后|後|参数|參數)|绘制|繪製|画出|画一|画个|生图(?!参数|是什么)|生圖|来一张|來一張|画(?!面|质|风|师|廊|布|得)|畫(?!面|質|風|師|廊|布|得))|(?:^|[.!?\n])\s*(?:please\s+)?(?:generate|draw|render|create)\b[\s\S]{0,60}\b(?:image|picture|illustration|portrait|photo)\b|(?:画像|イラスト).{0,20}(?:生成して|描いて)|(?:이미지|그림).{0,20}(?:생성해|그려)/i.test(text)
    && !/(?:不要|不用|别|別|无需|無需).{0,8}(?:生成|绘制|画|畫|生图)|\b(?:don't|do not)\s+(?:generate|draw|render|create)\b/i.test(text);
}

/** Exact repeat commands only; additional edits, questions and reply regeneration are not repeats. */
export function isRepeatImageRequest(text: string) {
  return /^(?:(?:请|請|帮我|幫我)\s*)?(?:重新生成(?:图片|圖片|一张|一張)?|再(?:生成|画|畫)(?:一张|一張)|再来一张|再來一張|再生[图圖]|重新生[图圖])[。！!\s]*$|^(?:please\s+)?(?:generate again|regenerate (?:the )?image|generate (?:another|one more) (?:image|picture))[.!\s]*$|^(?:もう一度生成|画像を再生成して)[。！!\s]*$|^(?:이미지 다시 생성|다시 생성해)[.!\s]*$/i.test(text.trim());
}
