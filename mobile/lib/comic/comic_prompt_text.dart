/// UI labels are localized; supplied template bodies retain their original text.
String comicPromptText(String language, String key) {
  const cn = {
    'title': '生成漫画提示词',
    'description': '两种模板均按页数：一行一页；单分镜的一张单格图也算一页。仅调用转换 API，不自动生图。',
    'format': '漫画模板',
    'jp': '日式整页',
    'single': '单分镜',
    'input': '想要生成的内容',
    'recommended': 'AI 推荐页数',
    'manual': '手动输入页数',
    'pages': '总页数（1–30）',
    'recommend': '获取 AI 推荐',
    'reason': '推荐理由',
    'generate': '生成提示词',
    'regenerate': '重新生成第一页起',
    'next': '生成下一批',
    'cancel': '取消本次请求',
    'output': '一行一页的提示词（可编辑）',
    'copy': '复制提示词',
    'import': '确认导入这些页',
    'raw': '原始响应与附注',
    'notes': '连续性附注',
    'confirmTitle': '导入漫画页？',
    'confirmBody': '将替换此日式漫画项目的页列表，并先备份当前项目；不会提交生图。',
    'confirm': '备份并导入',
    'close': '取消',
    'count': '已完成页数',
    'notice': '每次仅生成当前一批，下一批须手动点击；取消不保证服务端未处理或未计费。',
    'recommendRequired': '先为当前内容获取 AI 推荐，或切换手动页数。',
    'stale': '内容、模板或服务配置已变化，旧结果保留但不能导入。',
    'draftDamaged': '草稿损坏，原始内容保留；未覆盖保存。',
    'requesting': '正在请求转换服务…',
    'cancelled': '本次请求已取消；没有自动重发。',
    'staleResult': '请求期间内容或配置已变化，返回结果未采用。',
    'invalidResult': '返回内容不完整或页数不符，请检查原始响应；没有自动重试。',
    'requestFailed': '请求未完成；没有自动重试。',
    'batchComplete': '本批已完成；检查后可手动生成下一批。',
    'complete': '全部页数已完成，可检查、编辑并确认导入。',
    'saved': '草稿会自动保存在此工作区。',
    'copied': '已复制',
    'loading': '正在读取模板与草稿…',
    'empty': '填写内容后开始。',
    'imported': '已导入，尚未生图。',
    'openTemplates': '设置 → 提示词模板可查看或导入模板。'
  };
  const en = {
    'title': 'Generate comic prompts',
    'description':
        'Both templates count pages: one line per page; one single-panel image also counts as one page. Uses the conversion API only; never generates images automatically.',
    'format': 'Comic template',
    'jp': 'Japanese full page',
    'single': 'Single panel',
    'input': 'Content to create',
    'recommended': 'AI-recommended pages',
    'manual': 'Manual page count',
    'pages': 'Total pages (1–30)',
    'recommend': 'Get AI recommendation',
    'reason': 'Recommendation',
    'generate': 'Generate prompts',
    'regenerate': 'Generate again from page one',
    'next': 'Generate next batch',
    'cancel': 'Cancel this request',
    'output': 'One prompt per page (editable)',
    'copy': 'Copy prompts',
    'import': 'Confirm import of these pages',
    'raw': 'Raw response and notes',
    'notes': 'Continuity notes',
    'confirmTitle': 'Import comic pages?',
    'confirmBody':
        'Replaces this Japanese comic project’s pages after backing up the current project. No image request will be sent.',
    'confirm': 'Back up and import',
    'close': 'Cancel',
    'count': 'Completed pages',
    'notice':
        'Only the current batch is requested. Click explicitly for the next batch. Cancellation does not guarantee the provider has not processed or billed it.',
    'recommendRequired':
        'Get a recommendation for the current content, or choose manual pages.',
    'stale':
        'Content, template, or service settings changed. The old result is retained but cannot be imported.',
    'draftDamaged':
        'The original damaged draft is retained and will not be overwritten.',
    'requesting': 'Requesting the conversion service…',
    'cancelled': 'This request was cancelled; no automatic resend.',
    'staleResult':
        'Content or settings changed during the request. Its response was not applied.',
    'invalidResult':
        'The response is incomplete or has the wrong page count. Inspect the raw response; no automatic retry.',
    'requestFailed': 'The request did not complete; no automatic retry.',
    'batchComplete':
        'Batch complete. Review, then explicitly request the next batch.',
    'complete': 'All pages are complete. Review, edit, and confirm import.',
    'saved': 'The draft is automatically saved in this workspace.',
    'copied': 'Copied',
    'loading': 'Loading templates and draft…',
    'empty': 'Enter content to begin.',
    'imported': 'Imported; no images generated.',
    'openTemplates':
        'View or import templates under Settings → Prompt templates.'
  };
  const tw = {
    'title': '產生漫畫提示詞',
    'description': '兩種範本皆以頁數計：一行一頁；單分鏡的一張單格圖也算一頁。僅呼叫轉換 API，不自動生圖。',
    'format': '漫畫範本',
    'jp': '日式整頁',
    'single': '單分鏡',
    'input': '想要產生的內容',
    'recommended': 'AI 建議頁數',
    'manual': '手動輸入頁數',
    'pages': '總頁數（1–30）',
    'recommend': '取得 AI 建議',
    'reason': '建議理由',
    'generate': '產生提示詞',
    'regenerate': '從第一頁重新產生',
    'next': '產生下一批',
    'cancel': '取消本次請求',
    'output': '一行一頁的提示詞（可編輯）',
    'copy': '複製提示詞',
    'import': '確認匯入這些頁',
    'raw': '原始回應與附註',
    'notes': '連續性附註',
    'confirmTitle': '匯入漫畫頁？',
    'confirmBody': '將先備份目前專案，再取代此日式漫畫專案的頁列表；不提交生圖。',
    'confirm': '備份並匯入',
    'close': '取消',
    'count': '已完成頁數',
    'notice': '每次僅產生目前一批，下一批須手動點擊；取消不保證服務端尚未處理或計費。',
    'recommendRequired': '先取得目前內容的 AI 建議，或切換手動頁數。',
    'stale': '內容、範本或服務設定已變更，舊結果保留但不能匯入。',
    'draftDamaged': '草稿損壞，保留原始內容，不覆寫。',
    'requesting': '正在請求轉換服務…',
    'cancelled': '本次請求已取消；未自動重送。',
    'staleResult': '請求期間內容或設定已變更，回應未採用。',
    'invalidResult': '回應不完整或頁數不符；請查看原始回應，未自動重試。',
    'requestFailed': '請求未完成；未自動重試。',
    'batchComplete': '本批完成；檢查後可手動產生下一批。',
    'complete': '全部頁數完成，可檢查、編輯並確認匯入。',
    'saved': '草稿會自動儲存在此工作區。',
    'copied': '已複製',
    'loading': '正在讀取範本與草稿…',
    'empty': '填寫內容後開始。',
    'imported': '已匯入，尚未生圖。',
    'openTemplates': '設定 → 提示詞範本可檢視或匯入範本。'
  };
  const ja = {
    'title': '漫画プロンプトを生成',
    'description': '両形式とも1行1ページです。単一コマ画像1枚も1ページです。変換APIのみを使用し、画像は自動生成しません。',
    'format': '漫画テンプレート',
    'jp': '日本式の全ページ',
    'single': '単一コマ',
    'input': '作成したい内容',
    'recommended': 'AI推奨ページ数',
    'manual': 'ページ数を手入力',
    'pages': '総ページ数（1–30）',
    'recommend': 'AIの推奨を取得',
    'reason': '推奨理由',
    'generate': 'プロンプトを生成',
    'regenerate': '1ページ目から再生成',
    'next': '次のバッチを生成',
    'cancel': 'このリクエストを中止',
    'output': '1行1ページのプロンプト（編集可）',
    'copy': 'プロンプトをコピー',
    'import': 'これらのページを読み込む',
    'raw': '元の応答と注記',
    'notes': '連続性の注記',
    'confirmTitle': '漫画ページを読み込みますか？',
    'confirmBody': '現在のプロジェクトをバックアップ後、この日本式漫画のページ一覧を置き換えます。画像は生成しません。',
    'confirm': 'バックアップして読み込む',
    'close': 'キャンセル',
    'count': '完了ページ',
    'notice': '現在のバッチのみ要求します。続きは明示的にクリックしてください。中止しても処理や課金を取り消せるとは限りません。',
    'recommendRequired': '現在の内容の推奨を取得するか、手入力に切り替えてください。',
    'stale': '内容、テンプレート、サービス設定が変更されました。旧結果は保持しますが読み込めません。',
    'draftDamaged': '破損した下書きの原文を保持し、上書きしません。',
    'requesting': '変換サービスに要求中…',
    'cancelled': 'この要求を中止しました。自動再送はしません。',
    'staleResult': '要求中に内容や設定が変更されたため応答を適用しませんでした。',
    'invalidResult': '応答が不完全、またはページ数が異なります。元の応答を確認してください。自動再試行はしません。',
    'requestFailed': '要求を完了できませんでした。自動再試行はしません。',
    'batchComplete': 'このバッチが完了しました。確認後に次を手動で要求できます。',
    'complete': '全ページが完了しました。確認・編集後に読み込めます。',
    'saved': '下書きはこの作業領域に自動保存されます。',
    'copied': 'コピーしました',
    'loading': 'テンプレートと下書きを読み込み中…',
    'empty': '内容を入力してください。',
    'imported': '読み込みました。画像は生成していません。',
    'openTemplates': '設定 → プロンプトテンプレートで確認・読み込みできます。'
  };
  const ko = {
    'title': '만화 프롬프트 생성',
    'description':
        '두 형식 모두 한 줄당 한 페이지이며 단일 컷 이미지 한 장도 한 페이지입니다. 변환 API만 사용하며 이미지를 자동 생성하지 않습니다.',
    'format': '만화 템플릿',
    'jp': '일본식 전체 페이지',
    'single': '단일 컷',
    'input': '만들고 싶은 내용',
    'recommended': 'AI 추천 페이지 수',
    'manual': '페이지 수 직접 입력',
    'pages': '전체 페이지 (1–30)',
    'recommend': 'AI 추천 받기',
    'reason': '추천 이유',
    'generate': '프롬프트 생성',
    'regenerate': '첫 페이지부터 다시 생성',
    'next': '다음 묶음 생성',
    'cancel': '이 요청 취소',
    'output': '페이지당 한 줄 프롬프트 (편집 가능)',
    'copy': '프롬프트 복사',
    'import': '이 페이지 가져오기 확인',
    'raw': '원본 응답 및 메모',
    'notes': '연속성 메모',
    'confirmTitle': '만화 페이지를 가져올까요?',
    'confirmBody':
        '현재 프로젝트를 백업한 뒤 이 일본식 만화 프로젝트의 페이지 목록을 바꿉니다. 이미지 요청은 보내지 않습니다.',
    'confirm': '백업 후 가져오기',
    'close': '취소',
    'count': '완료된 페이지',
    'notice':
        '현재 묶음만 요청합니다. 다음 묶음은 직접 눌러야 합니다. 취소해도 제공자가 이미 처리하거나 청구했을 수 있습니다.',
    'recommendRequired': '현재 내용의 추천을 받거나 직접 입력으로 바꾸세요.',
    'stale': '내용, 템플릿 또는 서비스 설정이 바뀌었습니다. 이전 결과는 보존되지만 가져올 수 없습니다.',
    'draftDamaged': '손상된 원본 초안을 보존하며 덮어쓰지 않습니다.',
    'requesting': '변환 서비스 요청 중…',
    'cancelled': '이 요청을 취소했습니다. 자동 재전송하지 않습니다.',
    'staleResult': '요청 중 내용 또는 설정이 바뀌어 응답을 적용하지 않았습니다.',
    'invalidResult': '응답이 불완전하거나 페이지 수가 다릅니다. 원본 응답을 확인하세요. 자동 재시도하지 않습니다.',
    'requestFailed': '요청을 완료하지 못했습니다. 자동 재시도하지 않습니다.',
    'batchComplete': '현재 묶음이 완료되었습니다. 확인 후 다음 묶음을 직접 요청하세요.',
    'complete': '모든 페이지가 완료되었습니다. 확인하고 편집한 뒤 가져오세요.',
    'saved': '초안은 이 작업 공간에 자동 저장됩니다.',
    'copied': '복사됨',
    'loading': '템플릿 및 초안 로드 중…',
    'empty': '내용을 입력해 시작하세요.',
    'imported': '가져왔으며 이미지는 생성하지 않았습니다.',
    'openTemplates': '설정 → 프롬프트 템플릿에서 확인하거나 가져올 수 있습니다.'
  };
  final map = switch (language) {
    'zh-TW' => tw,
    'en-US' => en,
    'ja-JP' => ja,
    'ko-KR' => ko,
    _ => cn
  };
  return map[key] ?? en[key] ?? key;
}

String japaneseComicTitle(String language) => switch (language) {
      'zh-TW' => '\u65e5\u5f0f\u6f2b\u756b\u7522\u751f\u5668',
      'en-US' => 'Japanese comic generator',
      'ja-JP' =>
        '\u65e5\u672c\u5f0f\u6f2b\u753b\u30b8\u30a7\u30cd\u30ec\u30fc\u30bf\u30fc',
      'ko-KR' => '\uc77c\ubcf8\uc2dd \ub9cc\ud654 \uc0dd\uc131\uae30',
      _ => '\u65e5\u5f0f\u6f2b\u753b\u751f\u6210\u5668'
    };
String comicPageTerminology(String text, String language) {
  switch (language) {
    case 'zh-CN':
      return text.replaceAll('\u5206\u955c', '\u9875');
    case 'zh-TW':
      return text.replaceAll('\u5206\u93e1', '\u9801');
    case 'en-US':
      return text
          .replaceAll('Panels', 'Pages')
          .replaceAll('panels', 'pages')
          .replaceAll('Panel', 'Page')
          .replaceAll('panel', 'page');
    case 'ja-JP':
      return text.replaceAll('\u30b3\u30de', '\u30da\u30fc\u30b8');
    case 'ko-KR':
      return text.replaceAll('\ucef7', '\ud398\uc774\uc9c0');
    default:
      return text;
  }
}
