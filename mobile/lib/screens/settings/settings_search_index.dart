/// Static presentation metadata only. Never index settings values, endpoints,
/// account details, controllers or credentials.
enum AndroidSettingsCategory {
  access,
  ai,
  tags,
  network,
  preferences,
  storage,
  privacy,
  backup,
  appearance,
  navigation,
  diagnostics,
  updates
}

int _languageIndex(String language) => switch (language) {
      'zh-TW' => 1,
      'en-US' => 2,
      'ja-JP' => 3,
      'ko-KR' => 4,
      _ => 0
    };
String _pick(String language, List<String> values) =>
    values[_languageIndex(language)];
const _categoryTitles = <AndroidSettingsCategory, List<String>>{
  AndroidSettingsCategory.access: [
    '账号与接入',
    '帳號與接入',
    'Accounts & providers',
    'アカウントと接続',
    '계정 및 연결'
  ],
  AndroidSettingsCategory.ai: [
    'AI 服务',
    'AI 服務',
    'AI services',
    'AI サービス',
    'AI 서비스'
  ],
  AndroidSettingsCategory.tags: [
    '标签与 MCP',
    '標籤與 MCP',
    'Tags & MCP',
    'タグと MCP',
    '태그 및 MCP'
  ],
  AndroidSettingsCategory.network: ['网络', '網路', 'Network', 'ネットワーク', '네트워크'],
  AndroidSettingsCategory.preferences: [
    '创作偏好',
    '創作偏好',
    'Creation preferences',
    '創作の設定',
    '창작 환경설정'
  ],
  AndroidSettingsCategory.storage: [
    '图片与存储',
    '圖片與儲存',
    'Images & storage',
    '画像とストレージ',
    '이미지 및 저장소'
  ],
  AndroidSettingsCategory.privacy: [
    '隐私与安全',
    '隱私與安全',
    'Privacy & security',
    'プライバシーと安全',
    '개인정보 및 보안'
  ],
  AndroidSettingsCategory.backup: [
    '数据与备份',
    '資料與備份',
    'Data & backup',
    'データとバックアップ',
    '데이터 및 백업'
  ],
  AndroidSettingsCategory.appearance: [
    '外观与无障碍',
    '外觀與無障礙',
    'Appearance & accessibility',
    '外観とアクセシビリティ',
    '모양 및 접근성'
  ],
  AndroidSettingsCategory.navigation: [
    '导航',
    '導覽',
    'Navigation',
    'ナビゲーション',
    '탐색'
  ],
  AndroidSettingsCategory.diagnostics: ['诊断', '診斷', 'Diagnostics', '診断', '진단'],
  AndroidSettingsCategory.updates: [
    '更新与关于',
    '更新與關於',
    'Updates & about',
    '更新とアプリ情報',
    '업데이트 및 정보'
  ],
};
String androidSettingsCategoryTitle(
        String language, AndroidSettingsCategory category) =>
    _pick(language, _categoryTitles[category]!);
String androidSettingsCopy(String language, String key) => _pick(
    language,
    switch (key) {
      'title' => ['我的', '我的', 'My studio', 'マイページ', '내 스튜디오'],
      'search' => ['搜索设置', '搜尋設定', 'Search settings', '設定を検索', '설정 검색'],
      'empty' => [
          '没有匹配的设置',
          '沒有符合的設定',
          'No matching settings',
          '一致する設定はありません',
          '일치하는 설정이 없습니다'
        ],
      'choose' => [
          '选择分类，找到需要的设置',
          '選擇分類，尋找需要的設定',
          'Choose a category to get started',
          'カテゴリを選択してください',
          '카테고리를 선택하세요'
        ],
      'back' => ['返回设置首页', '返回設定首頁', 'Back to settings', '設定一覧へ戻る', '설정 홈으로'],
      'summary' => [
          '账号、服务与创作习惯，分开管理',
          '帳號、服務與創作習慣，分開管理',
          'Your accounts, services and creative preferences',
          'アカウント・サービス・創作設定をまとめて管理',
          '계정, 서비스 및 창작 환경설정 관리'
        ],
      'configured' => ['已配置', '已設定', 'Configured', '設定済み', '설정됨'],
      'unconfigured' => ['未配置', '未設定', 'Not configured', '未設定', '설정되지 않음'],
      'provider' => ['图像服务', '圖像服務', 'Image provider', '画像サービス', '이미지 서비스'],
      'navigationHint' => [
          '底部按创作、图库、AI、工具、我的分组。所有原功能及导航排序仍可从功能目录访问；已有导航顺序不会被清除。',
          '底部按創作、圖庫、AI、工具、我的分組。全部原功能及導覽排序仍可從功能目錄存取；原有順序不會清除。',
          'The bottom bar groups Create, Library, AI, Tools and My studio. All existing features and navigation reordering remain in the feature directory; saved ordering is preserved.',
          '下部は創作・ライブラリ・AI・ツール・マイページに分類。全機能と並べ替えは機能一覧から利用でき、保存済みの順序も保持します。',
          '하단은 창작, 라이브러리, AI, 도구, 내 스튜디오로 구분됩니다. 모든 기존 기능과 순서 변경은 기능 목록에서 이용하며 저장된 순서는 유지됩니다.'
        ],
      _ => ['设置', '設定', 'Settings', '設定', '설정'],
    });
const _titles = <String, List<String>>{
  'accounts': [
    'NovelAI 账号',
    'NovelAI 帳號',
    'NovelAI accounts',
    'NovelAI アカウント',
    'NovelAI 계정'
  ],
  'provider': [
    '兼容图像服务',
    '相容圖像服務',
    'Compatible image provider',
    '互換画像サービス',
    '호환 이미지 서비스'
  ],
  'balance': [
    '余额与账号状态',
    '餘額與帳號狀態',
    'Balance & account status',
    '残高とアカウント状態',
    '잔액 및 계정 상태'
  ],
  'openai-edit': [
    'OpenAI 图像编辑',
    'OpenAI 圖像編輯',
    'OpenAI image editing',
    'OpenAI 画像編集',
    'OpenAI 이미지 편집'
  ],
  'external-mcp': [
    '对外 MCP 服务',
    '對外 MCP 服務',
    'External MCP service',
    '外部 MCP サービス',
    '외부 MCP 서비스'
  ],
  'update': ['版本更新', '版本更新', 'App updates', 'アプリ更新', '앱 업데이트'],
  'update-source': ['更新来源', '更新來源', 'Update source', '更新元', '업데이트 소스'],
  'language': ['语言', '語言', 'Language', '言語', '언어'],
  'network': ['网络与代理', '網路與代理', 'Network & proxy', 'ネットワークとプロキシ', '네트워크 및 프록시'],
  'token-guide': [
    '如何获取 API Token',
    '如何取得 API Token',
    'API Token guide',
    'API Token ガイド',
    'API Token 안내'
  ],
  'reverse': ['AI 反推', 'AI 反推', 'Image analysis', '画像解析', '이미지 분석'],
  'convert': ['提示词转换', '提示詞轉換', 'Prompt conversion', 'プロンプト変換', '프롬프트 변환'],
  'tags': [
    '标签与 MCP 工具',
    '標籤與 MCP 工具',
    'Tags & MCP tools',
    'タグと MCP ツール',
    '태그 및 MCP 도구'
  ],
  'translate': ['翻译', '翻譯', 'Translation', '翻訳', '번역'],
  'templates': [
    '提示词模板库',
    '提示詞模板庫',
    'Prompt template library',
    'プロンプトテンプレート',
    '프롬프트 템플릿'
  ],
  'shortcuts': [
    '提示词快捷',
    '提示詞快捷',
    'Prompt shortcuts',
    'プロンプトショートカット',
    '프롬프트 바로가기'
  ],
  'storage': [
    '图片、元数据与存储',
    '圖片、中繼資料與儲存',
    'Images, metadata & storage',
    '画像・メタデータ・保存',
    '이미지, 메타데이터 및 저장소'
  ],
  'resources': [
    '资源数据库',
    '資源資料庫',
    'Resource database',
    'リソースデータベース',
    '리소스 데이터베이스'
  ],
  'backup': ['备份与恢复', '備份與還原', 'Backup & restore', 'バックアップと復元', '백업 및 복원'],
  'persistence': [
    '参数持久化',
    '參數持續儲存',
    'Parameter persistence',
    'パラメータの保存',
    '매개변수 유지'
  ],
  'sound': ['完成提示音', '完成提示音', 'Completion sounds', '完了音', '완료 알림음'],
  'appearance': [
    '主题、字体与无障碍',
    '主題、字型與無障礙',
    'Theme, type & accessibility',
    'テーマ・文字・アクセシビリティ',
    '테마, 글꼴 및 접근성'
  ],
  'about': ['关于与支持', '關於與支持', 'About & support', 'アプリ情報とサポート', '정보 및 지원'],
  'navigation': [
    '导航与功能目录',
    '導覽與功能目錄',
    'Navigation & feature directory',
    'ナビゲーションと機能一覧',
    '탐색 및 기능 목록'
  ],
  'diagnostics': ['AI 日志', 'AI 日誌', 'AI logs', 'AI ログ', 'AI 로그'],
};
String androidSettingsEntryTitle(String language, String id) =>
    _pick(language, _titles[id] ?? ['设置', '設定', 'Settings', '設定', '설정']);
Set<AndroidSettingsCategory> androidSettingsEntryCategories(String id) =>
    switch (id) {
      'accounts' || 'provider' || 'balance' || 'openai-edit' => {
          AndroidSettingsCategory.access
        },
      'reverse' || 'convert' || 'translate' || 'token-guide' => {
          AndroidSettingsCategory.ai
        },
      'external-mcp' || 'tags' => {AndroidSettingsCategory.tags},
      'network' => {AndroidSettingsCategory.network},
      'templates' || 'shortcuts' || 'persistence' || 'sound' => {
          AndroidSettingsCategory.preferences
        },
      'storage' => {
          AndroidSettingsCategory.storage,
          AndroidSettingsCategory.privacy
        },
      'resources' => {AndroidSettingsCategory.storage},
      'backup' => {AndroidSettingsCategory.backup},
      'language' => {AndroidSettingsCategory.appearance},
      'appearance' => {
          AndroidSettingsCategory.appearance,
          AndroidSettingsCategory.preferences,
          AndroidSettingsCategory.privacy
        },
      'navigation' => {AndroidSettingsCategory.navigation},
      'diagnostics' => {AndroidSettingsCategory.diagnostics},
      'update' || 'update-source' || 'about' => {
          AndroidSettingsCategory.updates
        },
      _ => {AndroidSettingsCategory.preferences},
    };
const _keywords = <String, String>{
  'accounts': 'account login token NovelAI 账号 登录 帳號 アカウント 계정',
  'provider': 'provider endpoint API 图像服务 中转 中轉 画像サービス 이미지',
  'balance': 'anlas balance tier refresh 余额 点数 餘額 残高 잔액',
  'openai-edit': 'OpenAI image edit endpoint key 图像编辑 圖像編輯 画像編集 이미지 편집',
  'external-mcp': 'MCP external server approval budget 对外 服务 审批 预算 對外 서버',
  'network': 'proxy VPN connection test 网络 代理 连接 網路 プロキシ 프록시',
  'reverse': 'reverse vision API model key 反推 模型 密钥 解析 モデル 모델',
  'convert': 'convert prompt API model key 转换 转換 提示词 模型 変換 모델',
  'tags':
      'Danbooru offline tag autocomplete MCP server 离线 标签 自动补全 工具 離線 標籤 タグ 태그',
  'translate': 'translate Google Baidu language 翻译 翻譯 百度 翻訳 번역',
  'templates':
      'template v3 comic manga import export 提示词 模板 漫画 导入 导出 テンプレート 템플릿',
  'shortcuts': 'shortcut prompt prefix suffix negative 快捷 前缀 后缀 ショートカット 바로가기',
  'storage':
      'image output folder file name metadata privacy stream cache gallery 图片 目录 文件名 元数据 隐私 流式 缓存 存储 中繼資料 保存 メタデータ 저장소',
  'resources':
      'database storage folder resources SQLite 资源 数据库 统一存储 資源 資料庫 リソース 데이터베이스',
  'backup': 'backup restore import export 备份 恢复 还原 備份 バックアップ 백업',
  'persistence':
      'persist parameters remember redraw generate 参数 保存 记住 重绘 參數 パラメータ 매개변수',
  'sound': 'audio volume completion notification 提示音 音量 声音 完了音 알림음',
  'appearance':
      'theme font size accessibility reduce motion auto complete secure 主题 字体 字号 动效 自动补全 安全 主題 無障礙 テーマ 글꼴',
  'navigation': 'navigation reorder directory 导航 排序 目录 導覽 並べ替え 순서',
  'diagnostics': 'diagnostics AI log error 诊断 日志 诊斷 ログ 로그',
  'update': 'version update install download 版本 更新 安装 下载 インストール 업데이트',
  'update-source': 'GitHub source 来源 來源 更新元 소스',
  'about': 'about project author support license 关于 项目 支持 关于 アプリ 정보',
  'language': 'locale language 简体 繁体 English 日本語 한국어 语言 語言 言語 언어',
  'token-guide': 'API token guide authentication how 令牌 获取 鑑權 ガイド 안내',
};
bool androidSettingsSearchMatches(
    {required String id,
    required String title,
    required String language,
    required String query}) {
  final words = query.trim().toLowerCase().split(RegExp(r'\s+'));
  if (words.every((word) => word.isEmpty)) return true;
  final entryTitle = androidSettingsEntryTitle(language, id);
  final keywords = _keywords[id] ?? '';
  final categories = androidSettingsEntryCategories(id)
      .map((category) => androidSettingsCategoryTitle(language, category))
      .join(' ');
  final index = '$title $entryTitle $keywords $categories'.toLowerCase();
  return words.every(index.contains);
}
