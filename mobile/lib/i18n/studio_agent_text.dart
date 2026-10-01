import 'app_locales.dart';

const _rows = <String, List<String>>{
  'activeChats': ['对话', '對話', 'Chats', '会話', '대화'],
  'archivedChats': ['已归档', '已歸檔', 'Archived', 'アーカイブ', '보관함'],
  'archiveChat': ['归档', '歸檔', 'Archive', 'アーカイブ', '보관'],
  'restoreChat': ['恢复对话', '恢復對話', 'Restore chat', '会話を復元', '대화 복원'],
  'noArchivedChats': [
    '暂无已归档对话',
    '暫無已歸檔對話',
    'No archived chats',
    'アーカイブ済みの会話はありません',
    '보관된 대화가 없습니다'
  ],
  'archivedReadOnly': [
    '此对话已归档，恢复后可继续。',
    '此對話已歸檔，恢復後可繼續。',
    'Archived chat. Restore to continue.',
    'アーカイブ済みの会話です。復元して続けられます。',
    '보관된 대화입니다. 복원하면 계속할 수 있습니다.'
  ],
  'providerPreset': [
    '提供商预设',
    '提供商預設',
    'Provider preset',
    'プロバイダー設定',
    '제공자 프리셋'
  ],
  'selectProvider': [
    '选择预设（仅填入，不保存）',
    '選擇預設（僅填入，不儲存）',
    'Choose preset (prefill only)',
    'プリセットを選択（入力のみ）',
    '프리셋 선택 (입력만)'
  ],
  'savedTemplates': [
    '已保存模板',
    '已儲存模板',
    'Saved templates',
    '保存済みテンプレート',
    '저장된 템플릿'
  ],
  'noSavedTemplates': [
    '暂无自定义模板；可在提示词工具中保存。',
    '暫無自訂模板；可在提示詞工具中儲存。',
    'No custom templates saved yet.',
    '保存済みのカスタムテンプレートはありません。',
    '저장된 사용자 템플릿이 없습니다.'
  ],
  'useSavedTemplate': [
    '请读取并使用我保存的模板：',
    '請讀取並使用我儲存的模板：',
    'Read and use my saved template:',
    '保存済みテンプレートを読み込んで使用：',
    '저장된 템플릿을 읽고 사용:'
  ],
  'flowChat': ['交流想法', '交流想法', 'Chat', '相談', '대화'],
  'flowPlan': ['确认方案', '確認方案', 'Review plan', 'プラン確認', '계획 확인'],
  'flowResult': ['查看结果', '查看結果', 'View result', '結果を見る', '결과 보기'],
  'contextUsage': ['上下文用量', '上下文用量', 'Context usage', 'コンテキスト使用量', '컨텍스트 사용량'],
  'tokens': ['tokens', 'tokens', 'tokens', 'トークン', '토큰'],
  'estimated': ['估算', '估算', 'estimated', '推定', '추정'],
  'autoCompact': [
    '自动压缩上下文',
    '自動壓縮上下文',
    'Auto-compact context',
    'コンテキストを自動圧縮',
    '컨텍스트 자동 압축'
  ],
  'compactNow': ['立即压缩', '立即壓縮', 'Compact now', '今すぐ圧縮', '지금 압축'],
  'currentCanvas': ['当前画布', '目前畫布', 'Current canvas', '現在のキャンバス', '현재 캔버스'],
  'galleryImage': ['历史图片', '歷史圖片', 'History image', '履歴画像', '기록 이미지'],
  'chooseFile': ['从设备选择', '從裝置選擇', 'Choose from device', 'デバイスから選択', '기기에서 선택'],
  "confirmTool": [
    "确认执行：{name}",
    "確認執行：{name}",
    "Confirm: {name}",
    "実行を確認：{name}",
    "실행 확인: {name}"
  ],
  "paidWarning": [
    "此操作可能消耗 Anlas 或由兼容服务收费。",
    "此操作可能消耗 Anlas 或由相容服務收費。",
    "This action may consume Anlas or incur charges from a compatible service.",
    "この操作は Anlas を消費するか、互換サービスの料金が発生する場合があります。",
    "이 작업은 Anlas를 소비하거나 호환 서비스 요금이 발생할 수 있습니다."
  ],
  "estimatedCost": [
    "本地估算约 {name} Anlas，实际扣费可能不同。",
    "本地估算約 {name} Anlas，實際扣費可能不同。",
    "Local estimate: about {name} Anlas; actual charge may differ.",
    "ローカル見積は約 {name} Anlas です。実際の請求は異なる場合があります。",
    "로컬 예상 비용은 약 {name} Anlas이며 실제 청구액은 다를 수 있습니다."
  ],
  "unknownCost": [
    "费用未知，可能收费；请确认参数后再执行。",
    "費用未知，可能收費；請確認參數後再執行。",
    "Cost is unknown and charges may apply; review the parameters before continuing.",
    "費用は不明で請求される場合があります。続行前に設定を確認してください。",
    "비용을 알 수 없으며 요금이 발생할 수 있습니다. 계속하기 전에 설정을 확인하세요."
  ],
  "cancel": ["取消", "取消", "Cancel", "キャンセル", "취소"],
  "confirm": ["确认执行", "確認執行", "Confirm", "実行する", "실행 확인"],
  "modelSettings": [
    "智能体模型设置",
    "智能體模型設定",
    "Agent model settings",
    "エージェントのモデル設定",
    "에이전트 모델 설정"
  ],
  "protocol": ["协议", "協定", "Protocol", "プロトコル", "프로토콜"],
  "apiAddress": ["API 地址", "API 位址", "API address", "API アドレス", "API 주소"],
  "modelId": ["模型 ID", "模型 ID", "Model ID", "モデル ID", "모델 ID"],
  "apiKey": ["API Key", "API Key", "API Key", "API キー", "API 키"],
  "separateApi": [
    "对话模型与 NovelAI 生图 Token 分开保存。",
    "對話模型與 NovelAI 生圖 Token 分開儲存。",
    "The chat model and NovelAI image token are stored separately.",
    "チャットモデルと NovelAI 画像トークンは別に保存されます。",
    "채팅 모델과 NovelAI 이미지 토큰은 별도로 저장됩니다."
  ],
  "save": ["保存", "儲存", "Save", "保存", "저장"],
  "chats": ["对话", "對話", "Chats", "チャット", "채팅"],
  "newChat": ["新建对话", "新增對話", "New chat", "新しいチャット", "새 대화"],
  "you": ["你", "你", "You", "あなた", "나"],
  "agent": ["智能体", "智能體", "Agent", "エージェント", "에이전트"],
  "missingImage": [
    "图片文件不可用",
    "圖片檔案無法使用",
    "Image file unavailable",
    "画像ファイルを利用できません",
    "이미지 파일을 사용할 수 없습니다"
  ],
  "missingModel": [
    "请先配置智能体对话模型",
    "請先設定智能體對話模型",
    "Configure the Agent chat model first",
    "先にチャットモデルを設定してください",
    "먼저 에이전트 채팅 모델을 설정하세요"
  ],
  "imageApi": [
    "生图继续使用软件现有 NovelAI 配置。",
    "生圖繼續使用軟體現有 NovelAI 設定。",
    "Image generation keeps the existing NovelAI settings.",
    "画像生成には既存の NovelAI 設定を使用します。",
    "이미지 생성에는 기존 NovelAI 설정을 사용합니다."
  ],
  "addAttachment": ["添加附件", "新增附件", "Add attachment", "添付ファイルを追加", "첨부 파일 추가"],
  "hint": [
    "描述想法、分析参考图或请求生图…",
    "描述想法、分析參考圖或請求生圖…",
    "Describe an idea, analyze a reference, or request an image…",
    "アイデアの説明、参照画像の分析、画像生成の依頼…",
    "아이디어 설명, 참조 이미지 분석 또는 이미지 생성 요청…"
  ],
  "stop": ["停止", "停止", "Stop", "停止", "중지"],
  "send": ["发送", "傳送", "Send", "送信", "보내기"],
  "loadFailed": [
    "对话数据读取失败",
    "對話資料讀取失敗",
    "Failed to load conversations",
    "会話データの読み込みに失敗しました",
    "대화 데이터를 불러오지 못했습니다"
  ],
  "retry": ["重试", "重試", "Retry", "再試行", "다시 시도"],
  "title": ["生图助手", "生圖助手", "Image assistant", "画像アシスタント", "이미지 어시스턴트"],
  "heroTitle": [
    "把想法变成画面",
    "把想法變成畫面",
    "Turn an idea into an image",
    "アイデアを画像に",
    "아이디어를 이미지로"
  ],
  "heroBody": [
    "描述想画的内容，或添加参考图。助手会结合当前参数帮你整理，执行前由你确认。",
    "描述想畫的內容，或加入參考圖。助手會結合目前參數幫你整理，執行前由你確認。",
    "Describe your idea or add a reference. The assistant uses your current settings and asks before taking action.",
    "アイデアを説明するか参照画像を追加してください。現在の設定を使い、実行前に確認します。",
    "아이디어를 설명하거나 참조 이미지를 추가하세요. 현재 설정을 활용하며 실행 전에 확인합니다."
  ],
  "quickSettings": [
    "查看当前生图设置",
    "查看目前生圖設定",
    "Review image settings",
    "画像設定を確認",
    "이미지 설정 확인"
  ],
  "quickPrompt": [
    "帮我整理提示词",
    "幫我整理提示詞",
    "Refine my prompt",
    "プロンプトを整理",
    "프롬프트 다듬기"
  ],
  "quickReference": [
    "分析一张参考图",
    "分析一張參考圖",
    "Analyze a reference",
    "参照画像を分析",
    "참조 이미지 분석"
  ],
  "quickPromptDraft": [
    "请帮我整理下面的画面描述为 NovelAI 提示词：\n",
    "請幫我整理下面的畫面描述為 NovelAI 提示詞：\n",
    "Turn the following scene description into a NovelAI prompt:\n",
    "次の説明を NovelAI のプロンプトに整理してください：\n",
    "다음 장면 설명을 NovelAI 프롬프트로 다듬어 주세요:\n"
  ],
  "quickSettingsDraft": [
    "请读取当前生图设置，告诉我哪些参数会影响这次生成，先不要生图。",
    "請讀取目前生圖設定，告訴我哪些參數會影響這次生成，先不要生圖。",
    "Review my current image settings and explain their effects. Do not generate yet.",
    "現在の画像設定とその影響を確認してください。まだ生成しないでください。",
    "현재 이미지 설정과 그 영향을 확인해 주세요. 아직 생성하지 마세요."
  ],
  "quickReferenceDraft": [
    "请分析这张参考图的构图、光线和风格，先不要生图。",
    "請分析這張參考圖的構圖、光線和風格，先不要生圖。",
    "Analyze this reference image’s composition, lighting and style. Do not generate yet.",
    "参照画像の構図、光、画風を分析してください。まだ生成しないでください。",
    "참조 이미지의 구도, 조명, 스타일을 분석해 주세요. 아직 생성하지 마세요."
  ],
  "ready": [
    "已配置对话模型",
    "已設定對話模型",
    "Chat model configured",
    "チャットモデル設定済み",
    "채팅 모델 설정됨"
  ],
  "setup": ["配置对话模型", "設定對話模型", "Set up chat model", "チャットモデルを設定", "채팅 모델 설정"],
  "setupBody": [
    "只需配置一次对话模型。生图仍使用你原来的 NovelAI 地址和 Token，不需要重新填写。",
    "只需設定一次對話模型。生圖仍使用原來的 NovelAI 位址和 Token，不需重新填寫。",
    "Set up a chat model once. Images keep using your existing NovelAI endpoint and token.",
    "チャットモデルを一度設定するだけです。画像は既存の NovelAI 接続とトークンを使います。",
    "채팅 모델은 한 번만 설정하면 됩니다. 이미지는 기존 NovelAI 주소와 토큰을 계속 사용합니다."
  ],
  "searchChats": ["搜索对话", "搜尋對話", "Search chats", "会話を検索", "대화 검색"],
  "noChats": [
    "没有匹配的对话",
    "沒有符合的對話",
    "No matching chats",
    "一致する会話がありません",
    "일치하는 대화 없음"
  ],
  "rename": ["重命名对话", "重新命名對話", "Rename chat", "会話名を変更", "대화 이름 변경"],
  "deleteChat": ["删除对话", "刪除對話", "Delete chat", "会話を削除", "대화 삭제"],
  "deleteHint": [
    "将删除这段对话及其附件，无法撤销。已保存到生成历史的图片不会因此删除。",
    "將刪除此對話及其附件，無法復原。已儲存至生成歷史的圖片不會因此刪除。",
    "This removes this chat and its attachments permanently. Images saved in generation history are not deleted.",
    "この会話と添付は元に戻せない形で削除されます。生成履歴に保存された画像は削除されません。",
    "이 대화와 첨부 파일을 영구 삭제합니다. 생성 기록에 저장된 이미지는 삭제되지 않습니다."
  ],
  "chatName": ["对话名称", "對話名稱", "Chat name", "会話名", "대화 이름"],
  "chatActions": ["对话操作", "對話操作", "Chat actions", "会話の操作", "대화 작업"],
  "statusRunning": ["正在处理", "處理中", "Working", "処理中", "처리 중"],
  "statusPending": ["等待确认", "等待確認", "Awaiting confirmation", "確認待ち", "확인 대기"],
  "statusComplete": ["已完成", "已完成", "Completed", "完了", "완료"],
  "statusError": ["未完成", "未完成", "Not completed", "未完了", "미완료"],
  "statusDenied": ["已取消", "已取消", "Cancelled", "キャンセル済み", "취소됨"],
  "statusStopped": ["已停止", "已停止", "Stopped", "停止済み", "중지됨"],
  "workingBody": [
    "助手正在整理或调用软件工具，你可以随时停止。",
    "助手正在整理或呼叫軟體工具，可隨時停止。",
    "The assistant is working with your request or app tools. You can stop at any time.",
    "アシスタントが処理しています。いつでも停止できます。",
    "요청이나 앱 도구를 처리하고 있습니다. 언제든 중지할 수 있습니다."
  ],
  "confirmationHint": [
    "请检查方案。只有点击确认后才会执行。",
    "請檢查方案，點擊確認後才會執行。",
    "Review the plan. Nothing executes until you confirm.",
    "内容を確認してください。確認するまで実行しません。",
    "계획을 검토하세요. 확인하기 전에는 실행하지 않습니다."
  ],
  "planTitle": ["生图方案", "生圖方案", "Image plan", "画像生成プラン", "이미지 생성 계획"],
  "prompt": ["正面提示词", "正向提示詞", "Positive prompt", "正のプロンプト", "긍정 프롬프트"],
  "model": ["生图模型", "生圖模型", "Image model", "画像モデル", "이미지 모델"],
  "size": ["图片尺寸", "圖片尺寸", "Image size", "画像サイズ", "이미지 크기"],
  "steps": ["步数", "步數", "Steps", "ステップ数", "단계"],
  "count": ["图片张数", "圖片張數", "Image count", "画像枚数", "이미지 수"],
  "details": ["技术详情", "技術詳情", "Technical details", "技術的な詳細", "기술 세부 정보"],
  "copy": ["复制文本", "複製文字", "Copy text", "テキストをコピー", "텍스트 복사"],
  "copied": ["已复制", "已複製", "Copied", "コピーしました", "복사됨"],
  "editRequest": ["修改要求", "修改要求", "Edit request", "依頼を編集", "요청 수정"],
  "changePlan": ["修改方案", "修改方案", "Revise plan", "プランを変更", "계획 수정"],
  "changePlanDraft": [
    "请修改刚才的生图方案：",
    "請修改剛才的生圖方案：",
    "Please revise the previous image plan: ",
    "先ほどの画像プランを変更してください：",
    "이전 이미지 계획을 수정해 주세요: "
  ],
  "continueImage": [
    "继续调整这张图",
    "繼續調整這張圖",
    "Refine this image",
    "この画像を調整",
    "이 이미지 조정"
  ],
  "continueImageDraft": [
    "请基于上一张生成图片继续调整：",
    "請根據上一張生成圖片繼續調整：",
    "Refine the previous generated image: ",
    "前の生成画像を調整してください：",
    "이전 생성 이미지를 조정해 주세요: "
  ],
  "preview": ["查看大图", "查看大圖", "View image", "画像を拡大", "이미지 보기"],
  "close": ["关闭", "關閉", "Close", "閉じる", "닫기"],
  "latest": ["回到最新", "回到最新", "Jump to latest", "最新に移動", "최신으로 이동"],
  "compose": ["消息输入", "訊息輸入", "Message input", "メッセージ入力", "메시지 입력"],
  "sendHint": [
    "Enter 发送 · Shift+Enter 换行",
    "Enter 傳送 · Shift+Enter 換行",
    "Enter to send · Shift+Enter for a new line",
    "Enter で送信 · Shift+Enter で改行",
    "Enter로 전송 · Shift+Enter로 줄바꿈"
  ],
  "cancelledSafe": [
    "未执行此操作。你可以修改要求后再发送。",
    "未執行此操作，可修改要求後再傳送。",
    "Nothing was executed. You can edit your request and send again.",
    "実行していません。依頼を編集して再送できます。",
    "실행하지 않았습니다. 요청을 수정해 다시 보낼 수 있습니다."
  ],
  "errorHint": [
    "先查看生成历史确认是否已有结果，再决定下一步；不会自动重试生图。",
    "請先查看生成歷史確認結果，再決定下一步；不會自動重試生圖。",
    "Check generation history for results before deciding what to do next. Image generation is not retried automatically.",
    "生成履歴で結果を確認してから次の操作を決めてください。自動再生成はしません。",
    "다음 작업 전에 생성 기록에서 결과를 확인하세요. 이미지를 자동으로 다시 생성하지 않습니다."
  ],
  "configInvalid": [
    "请填写有效的 http(s) API 地址和模型 ID。",
    "請填寫有效的 http(s) API 位址及模型 ID。",
    "Enter a valid http(s) API address and model ID.",
    "有効な http(s) API アドレスとモデル ID を入力してください。",
    "유효한 http(s) API 주소와 모델 ID를 입력하세요."
  ],
  "saveBusy": ["正在保存…", "儲存中…", "Saving…", "保存中…", "저장 중…"],
  "configureHint": [
    "填写服务商给出的对话接口和模型，不是 NovelAI 生图 Token。",
    "填寫服務商提供的對話介面與模型，不是 NovelAI 生圖 Token。",
    "Use your chat provider’s endpoint and model, not your NovelAI image token.",
    "チャット提供元の接続先とモデルを入力します。NovelAI の画像トークンではありません。",
    "NovelAI 이미지 토큰이 아닌 채팅 제공업체의 주소와 모델을 입력하세요."
  ],
  "busySwitch": [
    "处理完成或停止后可以切换对话",
    "處理完成或停止後可切換對話",
    "Switch chats when the request finishes or is stopped",
    "処理完了または停止後に会話を切り替えられます",
    "처리가 완료되거나 중지된 후 대화를 전환할 수 있습니다"
  ],
  "removeAttachment": ["移除附件", "移除附件", "Remove attachment", "添付を削除", "첨부 제거"],
  "imageAnalysis": [
    "允许分析参考图",
    "允許分析參考圖",
    "Enable reference image analysis",
    "参照画像の分析を有効化",
    "참조 이미지 분석 허용"
  ],
  "emptyInput": [
    "请输入内容或添加参考图",
    "請輸入內容或加入參考圖",
    "Enter a message or add a reference",
    "メッセージまたは参照画像を追加",
    "메시지나 참조 이미지 추가"
  ],
  "toolProgress": [
    "工具过程 · {name} 项",
    "工具過程 · {name} 項",
    "Tool activity · {name}",
    "ツール処理 · {name} 件",
    "도구 활동 · {name}개"
  ],
  "decisionArea": ["待确认操作", "待確認操作", "Pending approval", "確認待ちの操作", "승인 대기 작업"]
};

String studioAgentText(Object? language, String key, {String? name}) {
  final code = normalizeAppLocaleCode(language);
  final index = switch (code) {
    'zh-TW' => 1,
    'en-US' => 2,
    'ja-JP' => 3,
    'ko-KR' => 4,
    _ => 0
  };
  return (_rows[key]?[index] ?? key).replaceAll('{name}', name ?? '');
}
