export type ImageFailureStage = "proposal" | "generation";

const labels = {
  "zh-CN": {
    repeatAuto: "沿用当前方案生成。",
    repeatConfirm: "已沿用当前方案，确认后生图。",
    awaitingConfirmation: "确认后开始生图。",
    repairPending: "正在修正方案，最多 45 秒…",
    generationPending: "正在生成图片…",
    proposalTitle: "未开始生图", generationTitle: "图片生成失败",
    invalid: "生图方案格式有误，请重新生成回复。",
    missing: "未收到生图方案，请重新生成回复。",
    empty: "未收到图片，请重试生成。",
    partial: "已生成 {count} 张，后续生成失败：{error}",
    review: "方案修正失败，自动生图已暂停。请检查方案。",
    retained: "返回对话查看详情或重试。",
    open: "返回对话", close: "知道了",
  },
  "zh-TW": {
    repeatAuto: "沿用目前方案生成。",
    repeatConfirm: "已沿用目前方案，確認後生圖。",
    awaitingConfirmation: "確認後開始生圖。",
    repairPending: "正在修正方案，最多 45 秒…",
    generationPending: "正在生成圖片…",
    proposalTitle: "未開始生圖", generationTitle: "圖片生成失敗",
    invalid: "生圖方案格式有誤，請重新生成回覆。",
    missing: "未收到生圖方案，請重新生成回覆。",
    empty: "未收到圖片，請重試生成。",
    partial: "已生成 {count} 張，後續生成失敗：{error}",
    review: "方案修正失敗，自動生圖已暫停。請檢查方案。",
    retained: "返回對話查看詳情或重試。",
    open: "返回對話", close: "知道了",
  },
  "en-US": {
    repeatAuto: "Generating with the current plan.",
    repeatConfirm: "Current plan ready for confirmation.",
    awaitingConfirmation: "Confirm to start generating.",
    repairPending: "Repairing the plan, up to 45 seconds…",
    generationPending: "Generating image…",
    proposalTitle: "Generation not started", generationTitle: "Image generation failed",
    invalid: "Invalid image plan. Regenerate the reply.",
    missing: "No image plan received. Regenerate the reply.",
    empty: "No image received. Retry generation.",
    partial: "{count} image(s) generated. Subsequent generation failed: {error}",
    review: "Plan repair failed. Auto-generation paused. Review the plan.",
    retained: "Return to chat for details or to retry.",
    open: "View conversation", close: "Got it",
  },
  "ja-JP": {
    repeatAuto: "現在のプランで生成します。",
    repeatConfirm: "現在のプランを確認して生成してください。",
    awaitingConfirmation: "確認すると生成を開始します。",
    repairPending: "プランを修正中（最大45秒）…",
    generationPending: "画像を生成中…",
    proposalTitle: "画像生成は未開始です", generationTitle: "画像生成に失敗しました",
    invalid: "画像プランの形式が不正です。返信を再生成してください。",
    missing: "画像プランがありません。返信を再生成してください。",
    empty: "画像が返されませんでした。生成を再試行してください。",
    partial: "{count}枚を生成しました。その後の生成に失敗しました：{error}",
    review: "プラン修正に失敗し、自動生成を停止しました。プランを確認してください。",
    retained: "会話に戻って詳細を確認、または再試行してください。",
    open: "会話に戻る", close: "閉じる",
  },
  "ko-KR": {
    repeatAuto: "현재 제안으로 생성합니다.",
    repeatConfirm: "현재 제안을 확인한 뒤 생성하세요.",
    awaitingConfirmation: "확인하면 생성을 시작합니다.",
    repairPending: "제안 수정 중, 최대 45초…",
    generationPending: "이미지 생성 중…",
    proposalTitle: "생성이 시작되지 않았습니다", generationTitle: "이미지 생성 실패",
    invalid: "이미지 제안 형식이 잘못되었습니다. 답변을 다시 생성하세요.",
    missing: "이미지 제안이 없습니다. 답변을 다시 생성하세요.",
    empty: "이미지가 반환되지 않았습니다. 다시 생성하세요.",
    partial: "{count}장 생성 후 다음 생성에 실패했습니다: {error}",
    review: "제안 수정에 실패해 자동 생성을 일시 중지했습니다. 제안을 확인하세요.",
    retained: "대화로 돌아가 상세 내용을 확인하거나 다시 시도하세요.",
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
