import 'studio_agent_shared.dart';
import 'app_locales.dart';

const _rows = <String, List<String>>{
  "accountLoginRejected": ["官方登录未成功；已有凭据保留。", "官方登入未成功；已有憑據保留。", "Official login unsuccessful; existing credentials preserved.", "公式ログイン失敗。既存認証情報は保持。", "공식 로그인 실패. 기존 인증 정보는 유지됩니다."],
  "accountLoginNetwork": ["官方登录请求失败；未重试或转发至中转。", "官方登入請求失敗；未重試或轉發至中轉。", "Official login request failed; no retry or relay forwarding.", "公式ログイン通信失敗。再試行・中継転送はしません。", "공식 로그인 요청 실패. 재시도 또는 중계 전송은 없습니다."],
  "accountLoginOtp": ["OTP 协议未确认；未发送验证码，也未覆盖原凭据。请使用官方 API Token。", "OTP 協議未確認；未傳送驗證碼，也未覆寫原憑據。請使用官方 API Token。", "OTP protocol unverified; no code sent or credentials overwritten. Use an official API Token.", "OTP 仕様未確認。コード送信・認証情報上書きなし。公式API Tokenを使用してください。", "OTP 프로토콜 미확인. 코드 전송이나 인증 정보 덮어쓰기는 없습니다. 공식 API Token을 사용하세요."],
  "accountLoginChallenge": ["官方要求网页安全验证；请在官网完成验证或使用 API Token。未保存账号。", "官方要求網頁安全驗證；請在官網完成驗證或使用 API Token。未儲存帳戶。", "Official web security verification required. Complete it on the official website or use an API Token. Account not saved.", "公式サイトのセキュリティ検証が必要です。公式サイトで完了するか API Token を使用してください。未保存。", "공식 웹 보안 확인이 필요합니다. 공식 웹사이트에서 완료하거나 API Token을 사용하세요. 저장하지 않았습니다."],
  "accountLoginRateLimited": ["官方暂时限制登录频率；稍后重试，未保存账号。", "官方暫時限制登入頻率；稍後重試，未儲存帳戶。", "Official login rate limit. Try later; account not saved.", "公式ログインの頻度制限です。後で再試行してください。未保存。", "공식 로그인 요청 제한. 나중에 다시 시도하세요. 저장하지 않았습니다."],
  "accountLoginInvalidResponse": ["官方未返回有效登录凭据；未保存账号。", "官方未回傳有效登入憑證；未儲存帳戶。", "Official response contained no valid login token. Account not saved.", "公式応答に有効な認証情報がありません。未保存。", "공식 응답에 유효한 로그인 토큰이 없습니다. 저장하지 않았습니다."],
  "accountLoggedOut": ["未登录", "未登入", "Not signed in", "未ログイン", "로그아웃"],
  "accountSwitchBusy": [
    "任务或账号操作进行中，未切换账号",
    "任務或帳號操作進行中，未切換帳號",
    "Task or account operation in progress; account not switched",
    "処理中のためアカウントを切り替えませんでした",
    "작업 중이므로 계정을 전환하지 않았습니다"
  ],
  "accountLocked": [
    "任务进行中，账号已锁定",
    "任務進行中，帳號已鎖定",
    "Account locked during a task",
    "処理中はアカウントを固定",
    "작업 중 계정 잠김"
  ],
  "accountManage": ["管理", "管理", "Manage", "管理", "관리"],
  "accountManager": [
    "API 账号管理",
    "API 帳號管理",
    "API accounts",
    "API アカウント管理",
    "API 계정 관리"
  ],
  "accountMethodRelay": [
    "第三方中转独立 API Token",
    "第三方中轉獨立 API Token",
    "Third-party relay API Token",
    "中継サービスの独立 API Token",
    "중계 서비스 API Token"
  ],
  "accountMethodEmail": [
    "官方邮箱密码登录",
    "官方信箱密碼登入",
    "Official email/password login",
    "公式メール・パスワードログイン",
    "공식 이메일/비밀번호 로그인"
  ],
  "accountMethodKey": [
    "官方 API Token",
    "官方 API Token",
    "Official API Token",
    "公式 API Token",
    "공식 API Token"
  ],
  "accountSaveFailed": [
    "网络、账号输入或系统凭据库操作失败；未保存新账号。",
    "網路、帳號輸入或系統憑證庫操作失敗；未儲存新帳號。",
    "Network, account input or secure storage failed; no new account saved.",
    "ネットワーク・入力・安全な保存に失敗。新規アカウントは保存していません。",
    "네트워크, 입력 또는 보안 저장 실패. 새 계정을 저장하지 않았습니다."
  ],
  "accountUnsupported": [
    "不支持只读验证，未保存账号",
    "不支援唯讀驗證，未儲存帳號",
    "Read-only verification unsupported; account not saved",
    "読み取り専用検証非対応。未保存",
    "읽기 전용 검증 미지원. 저장하지 않음"
  ],
  "accountAuthFailed": [
    "API Token 无效或无权限，未保存账号",
    "API Token 無效或無權限，未儲存帳號",
    "Invalid or unauthorized API Token; account not saved",
    "API Token が無効または権限不足。未保存",
    "API Token 오류 또는 권한 없음. 저장하지 않음"
  ],
  "accountInvalidResponse": [
    "接口返回的账号数据不兼容，未保存账号",
    "介面回傳的帳號資料不相容，未儲存帳號",
    "Incompatible account response; account not saved",
    "アカウント応答が非対応。未保存",
    "호환되지 않는 계정 응답. 저장하지 않음"
  ],
  "accountValidationFailed": [
    "接口验证未通过，未保存账号",
    "介面驗證未通過，未儲存帳號",
    "API verification failed; account not saved",
    "API 検証失敗。未保存",
    "API 검증 실패. 저장하지 않음"
  ],
  "accountFailed": ["验证未通过", "驗證未通過", "Verification failed", "検証失敗", "검증 실패"],
  "accountSaved": [
    "验证通过，账号已保存",
    "驗證通過，帳號已儲存",
    "Verified; account saved",
    "検証成功・保存済み",
    "검증 성공. 계정 저장됨"
  ],
  "accountSavedDetail": [
    "只读连接与鉴权验证；未调用生图接口。相同接口地址和 API Token 不重复添加。",
    "唯讀連線與鑑權驗證；未呼叫生圖介面。相同介面位址和 API Token 不重複新增。",
    "Read-only connection/authentication check; no image generation. Matching endpoint and API Token are not added twice.",
    "読み取り専用の接続・認証検証。画像生成はしません。同じ接続先と API Token は重複登録しません。",
    "읽기 전용 연결/인증 검증. 이미지 생성 없음. 동일 주소와 API Token는 중복 추가하지 않습니다."
  ],
  "accountCached": ["（缓存）", "（快取）", " (cached)", "（キャッシュ）", " (캐시)"],
  "accountHideKey": [
    "隐藏 API Token",
    "隱藏 API Token",
    "Hide API Token",
    "API Token を隠す",
    "API Token 숨기기"
  ],
  "accountViewKey": [
    "查看 API Token",
    "查看 API Token",
    "View API Token",
    "API Token を表示",
    "API Token 보기"
  ],
  "accountCopyKey": [
    "复制 API Token",
    "複製 API Token",
    "Copy API Token",
    "API Token をコピー",
    "API Token 복사"
  ],
  "accountKeyCopied": [
    "API Token 已复制",
    "API Token 已複製",
    "API Token copied",
    "API Token をコピーしました",
    "API Token 복사됨"
  ],
  "accountNotSwitched": [
    "未切换账号",
    "未切換帳號",
    "Account not switched",
    "未切り替え",
    "전환하지 않음"
  ],
  "accountBusy": [
    "任务或账号操作进行中。",
    "任務或帳號操作進行中。",
    "Task or account operation in progress.",
    "タスクまたはアカウントの処理中です。",
    "작업 또는 계정 처리 중입니다."
  ],
  "accountCurrent": ["当前使用", "目前使用", "Current account", "使用中", "현재 계정"],
  "accountUse": ["使用此账号", "使用此帳號", "Use account", "このアカウントを使用", "이 계정 사용"],
  "accountVerified": ["验证通过", "驗證通過", "Verified", "検証成功", "검증 성공"],
  "accountNoBalance": [
    "连接与鉴权通过，接口未提供余额；未调用生图接口。",
    "連線與鑑權通過，介面未提供餘額；未呼叫生圖介面。",
    "Connected and authenticated; API did not provide a balance. No image generation.",
    "接続・認証成功。残高の応答なし。画像生成はしていません。",
    "연결/인증 성공. API 잔액 정보 없음. 이미지 생성 없음."
  ],
  "accountBalanceVerified": [
    "Anlas: {name}；只读验证，未调用生图接口。",
    "Anlas: {name}；唯讀驗證，未呼叫生圖介面。",
    "Anlas: {name}; read-only verification, no image generation.",
    "Anlas: {name}。読み取り専用検証。画像生成なし。",
    "Anlas: {name}. 읽기 전용 검증. 이미지 생성 없음."
  ],
  "accountVerify": ["验证", "驗證", "Verify", "検証", "검증"],
  "accountDeleteTitle": [
    "删除 {name}？",
    "刪除 {name}？",
    "Delete {name}?",
    "{name} を削除しますか？",
    "{name}을(를) 삭제할까요?"
  ],
  "accountDeleteDetail": [
    "删除当前账号后切换到剩余账号；删除最后一个后退出登录，不恢复旧 Token。",
    "刪除目前帳號後切換到剩餘帳號；刪除最後一個後登出，不恢復舊 Token。",
    "Deleting the active account switches to another. Deleting the last signs out; no old Token is restored.",
    "使用中のアカウントを削除すると別のものに切り替えます。最後を削除するとログアウトし、古い Token は復元しません。",
    "현재 계정 삭제 시 다른 계정으로 전환합니다. 마지막 계정 삭제 시 로그아웃하며 이전 Key는 복원하지 않습니다."
  ],
  "accountCancel": ["取消", "取消", "Cancel", "キャンセル", "취소"],
  "accountDelete": ["删除", "刪除", "Delete", "削除", "삭제"],
  "accountNotDeleted": [
    "未删除账号",
    "未刪除帳號",
    "Account not deleted",
    "削除していません",
    "삭제하지 않음"
  ],
  "accountDeleteFailed": [
    "任务进行中或系统凭据库写入失败。",
    "任務進行中或系統憑證庫寫入失敗。",
    "Task in progress or secure storage write failed.",
    "処理中または安全な保存への書き込み失敗。",
    "작업 중 또는 보안 저장 쓰기 실패."
  ],
  "accountSecurityHint": [
    "API Token 由 Android / iOS 系统安全存储加密保存，可查看／复制。任务执行期间账号与接口地址固定。",
    "API Token 由 Android / iOS 系統安全儲存加密保存，可查看／複製。任務執行期間帳號與介面位址固定。",
    "API Tokens are encrypted in Android / iOS secure storage and can be viewed/copied. Account and endpoint stay fixed during tasks.",
    "API Token は Android / iOS の安全な領域に暗号化保存し、表示・コピーできます。処理中はアカウントと接続先を固定します。",
    "API Token는 Android / iOS 보안 저장소에 암호화되며 보기/복사가 가능합니다. 작업 중 계정과 주소는 고정됩니다."
  ],
  "accountAdd": ["添加账号", "新增帳號", "Add account", "アカウント追加", "계정 추가"],
  "accountOfficialShort": [
    "官方 Token",
    "官方 Token",
    "Official Token",
    "公式 Token",
    "공식 Token"
  ],
  "accountEmailShort": ["邮箱密码", "信箱密碼", "Email login", "メール", "이메일"],
  "accountRelayShort": ["中转 Token", "中轉 Token", "Relay Token", "中継 Token", "중계 Token"],
  "accountRelayHint": [
    "使用中转站提供的独立 API Token，不回退官方。",
    "使用中轉站提供的獨立 API Token，不回退官方。",
    "Use the relay service’s own API Token; no fallback to official servers.",
    "中継サービスの独立 API Token を使用し、公式へフォールバックしません。",
    "중계 서비스의 독립 API Token를 사용하며 공식 서버로 대체하지 않습니다."
  ],
  "accountEmailHint": [
    "仅向官方登录，不保存密码。",
    "僅向官方登入，不儲存密碼。",
    "Official login only; password is not saved.",
    "公式のみでログインし、パスワードは保存しません。",
    "공식 로그인만 사용하며 비밀번호는 저장하지 않습니다."
  ],
  "accountOfficialHint": [
    "使用 NovelAI 官方 API Token。",
    "使用 NovelAI 官方 API Token。",
    "Use the official NovelAI API Token.",
    "NovelAI 公式 API Token を使用します。",
    "NovelAI 공식 API Token를 사용합니다."
  ],
  "accountLabel": ["账号名称", "帳號名稱", "Account name", "アカウント名", "계정 이름"],
  "accountEmail": ["官方邮箱", "官方信箱", "Official email", "公式メール", "공식 이메일"],
  "accountPassword": [
    "密码（不保存）",
    "密碼（不儲存）",
    "Password (not saved)",
    "パスワード（保存しません）",
    "비밀번호 (저장 안 함)"
  ],
  "accountRelayKey": [
    "中转平台 API Token",
    "中轉平台 API Token",
    "Relay API Token",
    "中継 API Token",
    "중계 API Token"
  ],
  "accountApiAddress": [
    "API 接口地址",
    "API 介面位址",
    "API endpoint",
    "API 接続先",
    "API 주소"
  ],
  "accountAddressHint": [
    "填写服务商提供的 HTTPS API 接口地址，不是后台网页地址；路径前缀请完整保留。",
    "填寫服務商提供的 HTTPS API 介面位址，不是後台網頁位址；路徑前綴請完整保留。",
    "Enter the provider’s HTTPS API endpoint, not its dashboard. Preserve the full path prefix.",
    "管理画面ではなく提供元の HTTPS API 接続先を入力し、パスのプレフィックスを保持してください。",
    "관리 페이지가 아닌 제공업체의 HTTPS API 주소를 입력하고 전체 경로 접두사를 유지하세요."
  ],
  "accountImageAddress": [
    "图片接口地址（可选，留空使用上方地址）",
    "圖片介面位址（可選，留空使用上方位址）",
    "Image endpoint (optional; blank uses API endpoint)",
    "画像接続先（任意・空欄は上記を使用）",
    "이미지 주소 (선택, 비우면 위 주소 사용)"
  ],
  "accountVerifying": ["正在验证…", "正在驗證…", "Verifying…", "検証中…", "검증 중…"],
  "accountVerifySave": [
    "验证并保存账号",
    "驗證並儲存帳號",
    "Verify and save account",
    "検証して保存",
    "검증 후 저장"
  ],
  "webQuery": ["网页查询", "網頁查詢", "Web query", "ウェブ検索", "웹 검색"],
  "confirmMode": ["每次确认", "每次確認", "Confirm", "毎回確認", "매번 확인"],
  "autoMode": ["全自动", "全自動", "Full auto", "全自動", "완전 자동"],
  "presetToggle": ["使用酒馆", "使用酒館", "Use Tavern", "酒館を使用", "타번 사용"],
  "presetInfinite": [
    "无限四代（生图适配）",
    "無限四代（生圖適配）",
    "Infinite Gen 4 (image workflow)",
    "無限四代（画像生成向け）",
    "Infinite Gen 4 (이미지용)"
  ],
  "presetComplete": [
    "综合生图预设",
    "綜合生圖預設",
    "Unified image preset",
    "統合画像プリセット",
    "통합 이미지 프리셋"
  ],
  "questionProgress": [
    "问题 {name}",
    "問題 {name}",
    "Question {name}",
    "質問 {name}",
    "질문 {name}"
  ],
  "questionManual": [
    "点击选项即可确认；可用上／下一题查看",
    "點擊選項即可確認；可用上／下一題查看",
    "Click an option to confirm; use Previous/Next to review",
    "選択肢をクリックして確定。前／次の質問で確認できます",
    "옵션을 클릭하여 확인하고 이전/다음으로 검토하세요"
  ],
  "questionChoose": [
    "选择一个选项，或自定义回答",
    "選擇一個選項，或自訂回答",
    "Choose an option or write your own answer",
    "選択肢または自由回答",
    "선택지 또는 직접 답변"
  ],
  "questionRecommended": ["推荐", "推薦", "Recommended", "おすすめ", "추천"],
  "questionCustom": ["自定义", "自訂", "Custom answer", "自由回答", "직접 입력"],
  "questionCustomHint": [
    "输入你的方向或要求…",
    "輸入你的方向或要求…",
    "Your preference or requirements…",
    "希望や条件を入力…",
    "원하는 방향이나 요구사항…"
  ],
  "questionPrevious": ["上一题", "上一題", "Previous", "前の質問", "이전"],
  "questionNext": ["下一题", "下一題", "Next", "次の質問", "다음"],
  "questionSubmit": ["提交回答", "提交回答", "Submit answers", "回答を送信", "답변 제출"],
  "questionSubmitting": ["提交中…", "提交中…", "Submitting…", "送信中…", "제출 중…"],
  "questionCancel": ["取消提问", "取消提問", "Cancel question", "質問をキャンセル", "질문 취소"],
  "questionFailed": [
    "回答未提交，请重试",
    "回答未提交，請重試",
    "Answer not submitted. Try again.",
    "未送信です。再試行してください。",
    "제출되지 않았습니다. 다시 시도하세요."
  ],
  "questionConfirmCustom": ["确定", "確定", "Confirm", "確定", "확인"],
  "menuReadTemplate": ["查看模板", "查看模板", "View templates", "テンプレートを見る", "템플릿 보기"],
  "menuApplyTemplate": [
    "应用模板",
    "套用模板",
    "Apply template",
    "テンプレートを適用",
    "템플릿 적용"
  ],
  "menuSaveTemplate": ["保存模板", "儲存模板", "Save template", "テンプレートを保存", "템플릿 저장"],
  "presetTemplate": ["预设模板", "預設模板", "Saved preset", "保存したプリセット", "저장된 프리셋"],
  "chooseTemplate": ["选择模板", "選擇模板", "Choose template", "テンプレートを選択", "템플릿 선택"],
  "stageAction": [
    "加入本次操作",
    "加入本次操作",
    "Add to this message",
    "今回の操作に追加",
    "이번 작업에 추가"
  ],
  "selectedActions": ["本次操作", "本次操作", "Selected actions", "今回の操作", "선택한 작업"],
  "removeAction": ["移除操作", "移除操作", "Remove action", "操作を外す", "작업 제거"],
  "actionPanelHint": [
    "仅添加操作标签，不改写输入内容；发送后才执行。生图和保存仍需确认。",
    "只加入操作標籤，不改寫輸入；傳送後才執行。生圖與儲存仍須確認。",
    "Adds an action chip without replacing your draft. Runs only when sent. Images and writes still require confirmation.",
    "入力は書き換えず操作タグを追加します。送信後に実行。画像生成・保存は別途確認します。",
    "입력을 바꾸지 않고 작업 태그만 추가합니다. 전송 후 실행하며 생성과 저장은 확인이 필요합니다."
  ],
  "mode_mixed": ["标签＋描述", "標籤＋描述", "Tags + description", "タグ＋説明", "태그 + 설명"],
  "mode_tags": ["标签", "標籤", "Tags", "タグ", "태그"],
  "mode_natural": ["自然语言", "自然語言", "Natural language", "自然言語", "자연어"],
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
    "描述想画的内容，或添加参考图。助手会结合当前参数帮你整理；可选择执行模式，并随时停止。",
    "描述想畫的內容，或加入參考圖。助手會結合目前參數幫你整理；可選擇執行模式，並隨時停止。",
    "Describe your idea or add a reference. The assistant uses your current settings to help; choose an execution mode and stop at any time.",
    "描きたい内容を説明するか、参照画像を追加してください。現在の設定を使って整理します。実行モードを選び、いつでも停止できます。",
    "원하는 그림을 설명하거나 참조 이미지를 추가하세요. 현재 설정을 바탕으로 정리하며, 실행 모드를 선택하고 언제든 중지할 수 있습니다."
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
  return ((studioAgentSharedRows[key] ?? _rows[key])?[index] ?? key)
      .replaceAll('{name}', name ?? '');
}
