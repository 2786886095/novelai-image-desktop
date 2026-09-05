import 'app_locales.dart';

const _tavernExtraRows = <String, List<String>>{
  'starterGenerateTitle': [
    '输入描述生成图片',
    '輸入描述生成圖片',
    'Generate from a description',
    '説明から画像を生成',
    '설명으로 이미지 생성'
  ],
  'starterGenerateDesc': [
    '把画面想法整理成可确认的生图方案',
    '把畫面想法整理成可確認的生圖方案',
    'Turn an idea into a confirmable image plan',
    'アイデアを確認可能な画像プランに整理',
    '아이디어를 확인 가능한 이미지 계획으로 정리'
  ],
  'starterGeneratePrompt': [
    '请把我接下来输入的画面描述整理为可确认的 NovelAI 生图方案。',
    '請把我接下來輸入的畫面描述整理為可確認的 NovelAI 生圖方案。',
    'Turn my next scene description into a confirmable NovelAI image plan.',
    '次に入力するシーン説明を確認可能な NovelAI 画像プランにしてください。',
    '다음 장면 설명을 확인 가능한 NovelAI 이미지 계획으로 정리해 주세요.'
  ],
  'starterReverseTitle': [
    '反推图片提示词',
    '反推圖片提示詞',
    'Reverse an image prompt',
    '画像からプロンプトを推定',
    '이미지 프롬프트 역추론'
  ],
  'starterReverseDesc': [
    '需要支持视觉能力的对话模型',
    '需要支援視覺能力的對話模型',
    'Requires a vision-capable chat model',
    '画像対応チャットモデルが必要です',
    '비전 지원 대화 모델 필요'
  ],
  'starterReversePrompt': [
    '请读取我接下来上传的图片，反推可用于 NovelAI 的提示词；若模型不支持视觉请提醒我切换。',
    '請讀取我接下來上傳的圖片，反推可用於 NovelAI 的提示詞；若模型不支援視覺請提醒我切換。',
    'Read my next image and reverse it into a NovelAI prompt; warn me if the model lacks vision.',
    '次の画像から NovelAI 用プロンプトを推定し、画像非対応なら通知してください。',
    '다음 이미지에서 NovelAI용 프롬프트를 역추론하고 비전 미지원이면 알려 주세요.'
  ],
  'starterTagTitle': ['搜索 Tag', '搜尋 Tag', 'Search tags', 'Tag を検索', 'Tag 검색'],
  'starterTagDesc': [
    '检索并解释 Danbooru 标签',
    '檢索並解釋 Danbooru 標籤',
    'Find and explain Danbooru tags',
    'Danbooru Tag を検索・説明',
    'Danbooru Tag 검색 및 설명'
  ],
  'starterTagPrompt': [
    '使用本地 Danbooru Tag 搜索查找并解释我接下来输入的概念。',
    '使用本機 Danbooru Tag 搜尋並解釋我接下來輸入的概念。',
    'Use local Danbooru tag search to find and explain my next concept.',
    'ローカル Danbooru Tag 検索で次の概念を検索・説明してください。',
    '로컬 Danbooru Tag 검색으로 다음 개념을 찾아 설명해 주세요.'
  ],
  'starterStyleTitle': [
    '识别画风并寻找画师串',
    '識別畫風並尋找畫師串',
    'Identify style and artist tags',
    '画風と画家 Tag を特定',
    '화풍 및 작가 Tag 찾기'
  ],
  'starterStyleDesc': [
    '分析目标图并迭代相近画师 Tag 组合',
    '分析目標圖並迭代相近畫師 Tag 組合',
    'Analyze and iterate similar artist-tag mixes',
    '画像を分析し近い画家 Tag を反復',
    '이미지를 분석하고 유사 작가 Tag 조합 반복'
  ],
  'starterStylePrompt': [
    '分析下一张图片的画风并迭代相近画师 Tag 组合。',
    '分析下一張圖片的畫風並迭代相近畫師 Tag 組合。',
    'Analyze the next image style and iterate similar artist-tag mixes.',
    '次の画像の画風を分析し、近い画家 Tag を反復してください。',
    '다음 이미지 화풍을 분석하고 유사 작가 Tag 조합을 반복해 주세요.'
  ],
  'starterRandomTitle': [
    '随机抽取画师串生图',
    '隨機抽取畫師串生圖',
    'Random artist-tag generation',
    '画家 Tag をランダム生成',
    '작가 Tag 무작위 생성'
  ],
  'starterRandomDesc': [
    '随机组合画师 Tag 与权重后生成',
    '隨機組合畫師 Tag 與權重後生成',
    'Mix random artist tags and weights',
    '画家 Tag とウェイトを組み合わせて生成',
    '작가 Tag와 가중치를 조합해 생성'
  ],
  'starterRandomPrompt': [
    '随机抽取画师 Tag 与权重，组合后生成图片。',
    '隨機抽取畫師 Tag 與權重，組合後生成圖片。',
    'Draw random artist tags and weights, then generate an image.',
    '画家 Tag とウェイトをランダムに選んで生成してください。',
    '작가 Tag와 가중치를 무작위로 뽑아 생성해 주세요.'
  ],
  'emptyQuestion': [
    '你想画什么？',
    '你想畫什麼？',
    'What would you like to draw?',
    '何を描きますか？',
    '무엇을 그릴까요?'
  ],
  'emptyStartHint': [
    '选择一种开始方式，或直接输入画面描述',
    '選擇一種開始方式，或直接輸入畫面描述',
    'Choose a starting point or describe the scene',
    '開始方法を選ぶかシーンを入力してください',
    '시작 방법을 선택하거나 장면을 입력하세요'
  ],
  'modeAuto': ['全自动', '全自動', 'Full auto', '全自動', '완전 자동'],
  'modeConfirm': ['确认模式', '確認模式', 'Confirm mode', '確認モード', '확인 모드'],
  'saveShare': [
    '保存或分享本地图片',
    '儲存或分享本機圖片',
    'Save or share local image',
    'ローカル画像を保存または共有',
    '로컬 이미지 저장 또는 공유'
  ],
  'switchSpeaker': ['切换发言角色', '切換發言角色', 'Switch speaker', '発言者を切り替え', '발언자 전환'],
  'groupChat': ['群聊', '群聊', 'Group chat', 'グループチャット', '그룹 채팅'],
  'builtInTemplate': [
    '内置 NovelAI 生图模板',
    '內置 NovelAI 生圖範本',
    'Built-in NovelAI image template',
    '内蔵 NovelAI 画像テンプレート',
    '내장 NovelAI 이미지 템플릿'
  ],
  'enabled': ['已启用', '已啟用', 'Enabled', '有効', '활성화됨'],
  'intentChip': ['画面意图整理', '畫面意圖整理', 'Intent cleanup', '意図の整理', '의도 정리'],
  'compositionChip': [
    '构图与光影',
    '構圖與光影',
    'Composition & lighting',
    '構図と照明',
    '구도와 조명'
  ],
  'paramsChip': ['参数确认', '參數確認', 'Parameter check', 'パラメータ確認', '매개변수 확인'],
  'currentParams': [
    '当前运行参数',
    '目前執行參數',
    'Current runtime parameters',
    '現在の実行パラメータ',
    '현재 실행 매개변수'
  ],
  'noLorebooks': [
    '暂无世界书。命中关键词后会自动注入对话。',
    '暫無世界書。命中關鍵字後會自動注入對話。',
    'No lorebooks yet. Matching entries are injected automatically.',
    'ワールド情報はありません。一致した項目は自動挿入されます。',
    '로어북이 없습니다. 일치 항목은 자동 삽입됩니다.'
  ],
  'itemCount': [
    '{count} 条 · {tokens} tokens',
    '{count} 條 · {tokens} tokens',
    '{count} entries · {tokens} tokens',
    '{count} 件 · {tokens} tokens',
    '{count}개 · {tokens} tokens'
  ],
  'modelSupportHint': [
    '从服务端检测模型和上下文；压缩阈值自动计算。API Key 仅存于安全存储。',
    '從服務端偵測模型與上下文；壓縮閾值自動計算。API Key 僅存於安全儲存。',
    'Models and context limits are detected from the service. API keys stay in secure storage.',
    'モデルとコンテキストを検出し、API Key は安全な領域に保存します。',
    '모델과 컨텍스트를 감지하며 API Key는 안전한 저장소에 보관합니다.'
  ],
  'autoModeHint': [
    '场景参数就绪后立即调用 NovelAI。',
    '場景參數就緒後立即呼叫 NovelAI。',
    'Run NovelAI as soon as scene parameters are ready.',
    'シーン設定後すぐ NovelAI を実行します。',
    '장면 매개변수가 준비되면 NovelAI를 즉시 실행합니다.'
  ],
  'confirmModeHint': [
    '确认或修改参数后才消耗 Anlas。',
    '確認或修改參數後才消耗 Anlas。',
    'Spend Anlas only after you confirm or edit parameters.',
    '確認または編集後に Anlas を消費します。',
    '확인 또는 수정 후에만 Anlas를 사용합니다.'
  ],
  'sessionParams': [
    '本次创作参数',
    '本次創作參數',
    'Session generation parameters',
    '今回の生成パラメータ',
    '이번 생성 매개변수'
  ],
  'sessionParamsHint': [
    '手动修改会成为后续提案默认值',
    '手動修改會成為後續提案預設值',
    'Manual changes become later proposal defaults',
    '手動変更は以後の既定値になります',
    '수동 변경값은 이후 기본값이 됩니다'
  ],
  'syncDefault': ['同步默认', '同步預設', 'Sync defaults', '既定値と同期', '기본값 동기화'],
  'naiModel': [
    'NovelAI 模型',
    'NovelAI 模型',
    'NovelAI model',
    'NovelAI モデル',
    'NovelAI 모델'
  ],
  'promptOwnership': [
    '负面提示词与风格提示词',
    '負面提示詞與畫風提示詞',
    'Negative & style prompts',
    'ネガティブと画風プロンプト',
    '네거티브 및 화풍 프롬프트'
  ],
  'promptOwnershipHint': [
    'AI 只生成正面提示词，这两项由你控制。',
    'AI 只生成正面提示詞，這兩項由你控制。',
    'AI creates only the positive prompt; you control these two.',
    'AI はポジティブだけを生成し、この2項目はユーザーが管理します。',
    'AI는 포지티브만 생성하며 이 두 항목은 사용자가 관리합니다.'
  ],
  'unset': ['未设置', '未設定', 'Not set', '未設定', '미설정'],
  'configure': ['设置', '設定', 'Configure', '設定', '설정'],
  'width': ['宽度', '寬度', 'Width', '幅', '너비'],
  'height': ['高度', '高度', 'Height', '高さ', '높이'],
  'generationSteps': ['采样步数', '採樣步數', 'Steps', 'Steps', '스텝'],
  'generationCount': ['生成张数', '生成張數', 'Image count', '生成枚数', '생성 장수'],
  'sampler': ['采样器', '採樣器', 'Sampler', 'サンプラー', '샘플러'],
  'chatAdjustHint': [
    '可直接通过对话修改尺寸、步数和张数。',
    '可直接透過對話修改尺寸、步數和張數。',
    'You can change size, steps, and count in chat.',
    '会話でサイズ・Steps・枚数を変更できます。',
    '대화에서 크기, 스텝, 장수를 변경할 수 있습니다.'
  ],
  'templateInUse': [
    '正在使用内置 NovelAI 生图模板，运行参数仍可调整。',
    '正在使用內置 NovelAI 生圖範本，執行參數仍可調整。',
    'The built-in NovelAI image template is active; runtime parameters remain editable.',
    '内蔵 NovelAI テンプレートを使用中です。実行設定は変更できます。',
    '내장 NovelAI 템플릿을 사용 중이며 실행 설정은 변경할 수 있습니다.'
  ],
  'visualUnset': [
    '尚未填写角色外观提示词。',
    '尚未填寫角色外觀提示詞。',
    'No character appearance prompt has been set.',
    'キャラクター外観プロンプトは未設定です。',
    '캐릭터 외형 프롬프트가 설정되지 않았습니다.'
  ],
  'promptDialogTitle': [
    '负面提示词与风格提示词',
    '負面提示詞與畫風提示詞',
    'Negative & style prompts',
    'ネガティブと画風プロンプト',
    '네거티브 및 화풍 프롬프트'
  ],
  'chooseStyle': [
    '从风格提示词列表选择',
    '從畫風提示詞清單選擇',
    'Choose from style prompts',
    '画風プロンプト一覧から選択',
    '화풍 프롬프트 목록에서 선택'
  ],
  'stylePrompt': ['风格提示词', '畫風提示詞', 'Style prompt', '画風プロンプト', '화풍 프롬프트'],
  'addStyleTitle': [
    '加入风格提示词列表',
    '加入畫風提示詞清單',
    'Add to style prompt list',
    '画風プロンプト一覧に追加',
    '화풍 프롬프트 목록에 추가'
  ],
  'name': ['名称', '名稱', 'Name', '名前', '이름'],
  'add': ['加入', '加入', 'Add', '追加', '추가'],
  'styleAdded': [
    '风格提示词已加入列表',
    '畫風提示詞已加入清單',
    'Style prompt added',
    '画風プロンプトを追加しました',
    '화풍 프롬프트를 추가했습니다'
  ],
  'addToList': ['加入列表', '加入清單', 'Add to list', '一覧に追加', '목록에 추가'],
  'negativePrompt': [
    '负面提示词',
    '負面提示詞',
    'Negative prompt',
    'ネガティブプロンプト',
    '네거티브 프롬프트'
  ],
  'restoreDefault': ['恢复默认', '恢復預設', 'Restore default', '既定値に戻す', '기본값 복원'],
  'gotIt': ['知道了', '知道了', 'Got it', '了解', '확인'],
  'description': [
    '角色描述',
    '角色描述',
    'Character description',
    'キャラクター説明',
    '캐릭터 설명'
  ],
  'personality': [
    '性格与说话方式',
    '性格與說話方式',
    'Personality & voice',
    '性格と話し方',
    '성격 및 말투'
  ],
  'scenario': ['场景', '場景', 'Scenario', 'シーン', '장면'],
  'firstMessage': ['首条消息', '首則訊息', 'First message', '最初のメッセージ', '첫 메시지'],
  'examples': ['示例对话', '範例對話', 'Example dialogue', '会話例', '예시 대화'],
  'tags': [
    '标签（逗号分隔）',
    '標籤（逗號分隔）',
    'Tags (comma separated)',
    'Tag（カンマ区切り）',
    '태그(쉼표 구분)'
  ],
  'positivePrompt': [
    '角色正面提示词',
    '角色正面提示詞',
    'Character positive prompt',
    'キャラクターのポジティブ',
    '캐릭터 포지티브 프롬프트'
  ],
  'characterNegative': [
    '角色负面提示词',
    '角色負面提示詞',
    'Character negative prompt',
    'キャラクターのネガティブ',
    '캐릭터 네거티브 프롬프트'
  ],
  'systemPrompt': [
    '角色系统提示词',
    '角色系統提示詞',
    'Character system prompt',
    'キャラクターシステムプロンプト',
    '캐릭터 시스템 프롬프트'
  ],
  'postHistory': [
    '历史后指令',
    '歷史後指令',
    'Post-history instruction',
    '履歴後の指示',
    '기록 후 지시'
  ],
  'personaDescription': [
    '身份、外观与叙事偏好',
    '身分、外觀與敘事偏好',
    'Identity, appearance, and narrative preferences',
    '身元・外観・語りの好み',
    '정체성, 외형 및 서술 선호'
  ],
  'details': ['说明', '說明', 'Description', '説明', '설명'],
  'entryCount': [
    '条目 {count}',
    '條目 {count}',
    '{count} entries',
    '{count} 件',
    '항목 {count}개'
  ],
  'addEntry': ['添加条目', '新增條目', 'Add entry', '項目を追加', '항목 추가'],
  'persistentEntry': ['常驻条目', '常駐條目', 'Always-on entry', '常時有効', '항상 활성'],
  'close': ['关闭', '關閉', 'Close', '閉じる', '닫기'],
  'loreEntry': ['世界书条目', '世界書條目', 'Lorebook entry', 'ワールド情報項目', '로어북 항목'],
  'entryTitle': ['标题', '標題', 'Title', 'タイトル', '제목'],
  'primaryKeys': [
    '主关键词（逗号分隔）',
    '主關鍵字（逗號分隔）',
    'Primary keys (comma separated)',
    '主要キーワード（カンマ区切り）',
    '주 키워드(쉼표 구분)'
  ],
  'secondaryKeys': [
    '次关键词（可选）',
    '次關鍵字（選填）',
    'Secondary keys (optional)',
    '副キーワード（任意）',
    '보조 키워드(선택)'
  ],
  'injectionContent': ['注入内容', '注入內容', 'Injected content', '挿入内容', '삽입 내용'],
  'alwaysActive': ['始终激活', '始終啟用', 'Always active', '常に有効', '항상 활성'],
  'matchSecondary': [
    '同时匹配次关键词',
    '同時符合次關鍵字',
    'Also match secondary keys',
    '副キーワードも一致',
    '보조 키워드도 일치'
  ],
  'proposalPositive': [
    '正面提示词',
    '正面提示詞',
    'Positive prompt',
    'ポジティブプロンプト',
    '포지티브 프롬프트'
  ],
  'proposalHint': [
    'AI 仅生成正面提示词；其余请在生图设置调整。',
    'AI 僅生成正面提示詞；其餘請在生圖設定調整。',
    'AI creates only the positive prompt; adjust the rest in Image settings.',
    'AI はポジティブだけを生成します。その他は画像設定で調整してください。',
    'AI는 포지티브만 생성합니다. 나머지는 이미지 설정에서 조정하세요.'
  ],
  'quantity': ['数量', '數量', 'Quantity', '枚数', '수량'],
  'providerPreset': ['服务预设', '服務預設', 'Provider preset', 'サービスプリセット', '서비스 프리셋'],
  'protocol': ['协议', '協定', 'Protocol', 'プロトコル', '프로토콜'],
  'providerName': ['服务商名称', '服務商名稱', 'Provider name', 'プロバイダー名', '서비스 제공자 이름'],
  'apiAddress': ['API 地址', 'API 位址', 'API address', 'API アドレス', 'API 주소'],
  'modelName': ['模型名称', '模型名稱', 'Model name', 'モデル名', '모델 이름'],
  'detectModels': [
    '检测模型与上下文',
    '偵測模型與上下文',
    'Detect models & context',
    'モデルとコンテキストを検出',
    '모델 및 컨텍스트 감지'
  ],
  'detectionResult': ['检测结果', '偵測結果', 'Detection result', '検出結果', '감지 결과'],
  'contextLength': ['上下文长度', '上下文長度', 'Context length', 'コンテキスト長', '컨텍스트 길이'],
  'maxOutput': ['最大输出', '最大輸出', 'Maximum output', '最大出力', '최대 출력'],
  'autoCompress': [
    '自动压缩上下文',
    '自動壓縮上下文',
    'Compress context automatically',
    'コンテキストを自動圧縮',
    '컨텍스트 자동 압축'
  ],
  'autoCompressHint': [
    '按上下文与最大输出自动计算阈值',
    '依上下文與最大輸出自動計算閾值',
    'Calculate threshold from context and maximum output',
    'コンテキストと最大出力から自動計算',
    '컨텍스트와 최대 출력으로 자동 계산'
  ],
  'allowImages': [
    '允许读取图片附件',
    '允許讀取圖片附件',
    'Allow image attachments',
    '画像添付を許可',
    '이미지 첨부 허용'
  ],
  'styleValue': [
    '风格提示词：{value}',
    '畫風提示詞：{value}',
    'Style prompt: {value}',
    '画風プロンプト：{value}',
    '화풍 프롬프트: {value}'
  ],
  'negativeValue': [
    '负面词：{value}',
    '負面詞：{value}',
    'Negative prompt: {value}',
    'ネガティブ：{value}',
    '네거티브: {value}'
  ],
  'tavernImageGroup': [
    '酒馆 AI 生图',
    '酒館 AI 生圖',
    'Tavern AI Image',
    'Tavern AI 画像生成',
    'Tavern AI 이미지'
  ],
  'autoDesc': [
    '方案完成后直接调用 NovelAI 生成',
    '方案完成後直接呼叫 NovelAI 生成',
    'Generate with NovelAI when the plan is ready',
    'プラン完成後すぐ NovelAI で生成',
    '계획이 준비되면 NovelAI로 생성'
  ],
  'builtIn': ['内置受保护', '內置受保護', 'Built-in protected', '内蔵・保護済み', '내장 보호됨'],
  'builtInHint': [
    '核心角色模板由软件维护，运行参数仍可调整。',
    '核心角色範本由軟體維護，執行參數仍可調整。',
    'Core character templates are maintained by the app; runtime parameters remain editable.',
    '中核テンプレートはアプリが管理し、実行設定は変更できます。',
    '핵심 템플릿은 앱이 관리하며 실행 설정은 변경할 수 있습니다.'
  ],
  'chatModelDesc': [
    '理解画面并组织提示词的模型',
    '理解畫面並組織提示詞的模型',
    'Model used to understand scenes and prepare prompts',
    'シーンを理解してプロンプトを作るモデル',
    '장면을 이해하고 프롬프트를 구성하는 모델'
  ],
  'commandEmpty': [
    '没有匹配的生图命令',
    '沒有符合的生圖命令',
    'No matching image command',
    '一致する画像コマンドがありません',
    '일치하는 이미지 명령 없음'
  ],
  'confirmDesc': [
    '检查提示词和参数后再生成',
    '檢查提示詞與參數後再生成',
    'Review prompts and parameters before generation',
    'プロンプトと設定を確認してから生成',
    '프롬프트와 매개변수 확인 후 생성'
  ],
  'deleteLorebook': [
    '删除世界书',
    '刪除世界書',
    'Delete lorebook',
    'ワールド情報を削除',
    '로어북 삭제'
  ],
  'deleteLorebookHint': [
    '将从所有关联中移除且无法撤销。',
    '將從所有關聯中移除且無法復原。',
    'It will be removed from all links and cannot be undone.',
    'すべての関連から削除され、元に戻せません。',
    '모든 연결에서 삭제되며 되돌릴 수 없습니다.'
  ],
  'drawPlanDesc': [
    '把想法整理为可确认的 NovelAI 方案',
    '把想法整理為可確認的 NovelAI 方案',
    'Turn the idea into a confirmable NovelAI plan',
    'アイデアを確認可能な NovelAI プランに整理',
    '아이디어를 확인 가능한 NovelAI 계획으로 정리'
  ],
  'drawTemplate': [
    '把以下画面整理为 NovelAI V5 提示词并创建生图方案：',
    '把以下畫面整理為 NovelAI V5 提示詞並建立生圖方案：',
    'Turn the following scene into a NovelAI V5 prompt and image plan:',
    '次のシーンを NovelAI V5 プロンプトと画像プランにしてください：',
    '다음 장면을 NovelAI V5 프롬프트와 이미지 계획으로 정리해 주세요:'
  ],
  'imageParamsDesc': [
    '尺寸、步数、CFG 与采样器',
    '尺寸、步數、CFG 與採樣器',
    'Size, steps, CFG, and sampler',
    'サイズ・Steps・CFG・サンプラー',
    '크기, 스텝, CFG 및 샘플러'
  ],
  'newImageChat': [
    '新建生图对话',
    '新增生圖對話',
    'New image chat',
    '新規画像チャット',
    '새 이미지 대화'
  ],
  'newImageChatDesc': [
    '保留角色设定并开始新任务',
    '保留角色設定並開始新任務',
    'Keep the character setup and start a new task',
    'キャラクター設定を保って新しい作業を開始',
    '캐릭터 설정을 유지하고 새 작업 시작'
  ],
  'promptTemplate': [
    '整理以下内容为 NovelAI V5 提示词并检查冲突：',
    '整理以下內容為 NovelAI V5 提示詞並檢查衝突：',
    'Refine the following into a NovelAI V5 prompt and check conflicts:',
    '次の内容を NovelAI V5 プロンプトに整理し競合を確認：',
    '다음 내용을 NovelAI V5 프롬프트로 정리하고 충돌 확인:'
  ],
  'refinePromptDesc': [
    '优化提示词并检查 Tag 冲突',
    '最佳化提示詞並檢查 Tag 衝突',
    'Improve prompts and check tag conflicts',
    'プロンプトを改善し Tag 競合を確認',
    '프롬프트 개선 및 Tag 충돌 확인'
  ],
  'view': ['查看', '查看', 'View', '表示', '보기'],
  'steps': ['步', '步', 'steps', 'Steps', '스텝'],
  'addLore': ['新建世界书', '新增世界書', 'New lorebook', '新規ワールド情報', '새 로어북'],
  'addPersona': ['新建身份', '新增身分', 'New persona', '新規ペルソナ', '새 페르소나'],
  'attach': [
    '添加图片或文件',
    '加入圖片或檔案',
    'Add images or files',
    '画像またはファイルを追加',
    '이미지 또는 파일 추가'
  ],
  'avatar': ['头像', '頭像', 'Avatar', 'アバター', '아바타'],
  'background': ['背景', '背景', 'Background', '背景', '배경'],
  'delete': ['删除', '刪除', 'Delete', '削除', '삭제'],
  'editParams': ['修改参数', '修改參數', 'Edit parameters', 'パラメータを編集', '매개변수 편집'],
  'failed': ['生成失败', '生成失敗', 'Generation failed', '生成失敗', '생성 실패'],
  'generated': [
    '场景图已保存到历史记录',
    '場景圖已儲存至歷史記錄',
    'Scene saved to history',
    'シーン画像を履歴に保存しました',
    '장면 이미지가 기록에 저장됨'
  ],
  'generating': [
    '正在生成场景图…',
    '正在生成場景圖…',
    'Generating scene…',
    'シーンを生成中…',
    '장면 생성 중…'
  ],
  'group': ['群聊成员', '群聊成員', 'Group members', 'グループメンバー', '그룹 멤버'],
  'loreEnabled': [
    '在当前对话启用',
    '在目前對話啟用',
    'Enable in this chat',
    'このチャットで有効',
    '현재 대화에서 활성화'
  ],
  'visualPrompt': [
    'NovelAI 角色视觉预设',
    'NovelAI 角色視覺預設',
    'NovelAI visual preset',
    'NovelAI ビジュアル設定',
    'NovelAI 비주얼 프리셋'
  ],
};

Map<String, String> tavernExtraText(Object? language) {
  final code = normalizeAppLocaleCode(language);
  final index = _tavernExtraLocaleIndex[code] ?? 0;
  return _tavernExtraRows.map((key, values) => MapEntry(key, values[index]));
}

const _tavernExtraLocaleIndex = <String, int>{
  'zh-CN': 0,
  'zh-TW': 1,
  'en-US': 2,
  'ja-JP': 3,
  'ko-KR': 4
};

String formatTavernText(String template, Map<String, Object> values) {
  var result = template;
  for (final entry in values.entries) {
    result = result.replaceAll('{${entry.key}}', '${entry.value}');
  }
  return result;
}
