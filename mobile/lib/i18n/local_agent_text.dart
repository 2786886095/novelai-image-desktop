import 'app_locales.dart';

String localAgentText(Object? locale, String key) {
  const text = <String, List<String>>{
    "componentCheck": [
      "检查适配更新",
      "檢查適配更新",
      "Check component",
      "適配更新を確認",
      "구성 요소 확인"
    ],
    "officialCheck": [
      "检查官方更新",
      "檢查官方更新",
      "Check official",
      "公式更新を確認",
      "공식 업데이트 확인"
    ],
    "componentPrepare": [
      "准备适配升级",
      "準備適配升級",
      "Prepare component upgrade",
      "適配版の更新を準備",
      "구성 요소 업그레이드 준비"
    ],
    "officialPrepare": [
      "准备官方升级",
      "準備官方升級",
      "Prepare official upgrade",
      "公式版の更新を準備",
      "공식 업그레이드 준비"
    ],
    "updateHelp": [
      "更新与运行说明",
      "更新與執行說明",
      "Update & runtime details",
      "更新と実行の説明",
      "업데이트 및 실행 안내"
    ],
    "current": ["当前", "目前", "Current", "現在", "현재"],
    "latest": ["最新", "最新", "Latest", "最新", "최신"],
    "checkFailed": [
      "检测失败，可重试",
      "檢測失敗，可重試",
      "Check failed; retry",
      "確認失敗・再試行",
      "확인 실패: 다시 시도"
    ],
    "notPublishedShort": [
      "暂无已发布适配包",
      "尚無已發布適配包",
      "No published compatible package",
      "公開された互換パッケージなし",
      "게시된 호환 패키지 없음"
    ],
    "officialBlocked": [
      "尚无匹配官方最新版的 Android 适配包；保留现有酒馆。",
      "尚無符合官方最新版的 Android 適配包；保留現有酒館。",
      "No Android package matches the latest official version; existing Tavern retained.",
      "公式最新版に対応する Android パッケージがありません。既存環境を保持します。",
      "공식 최신 버전과 일치하는 Android 패키지가 없어 기존 환경을 유지합니다."
    ],
    "checkingLog": [
      "正在分别检查 Studio 适配组件和 Harness 官方版本…",
      "正在分別檢查 Studio 適配元件和 Harness 官方版本…",
      "Checking Studio component and official Harness…",
      "Studio と公式 Harness を確認中…",
      "Studio 구성 요소 및 공식 Harness 확인 중…"
    ],
    "checkedLog": [
      "更新检测完成。升级需要兼容检查通过并由你确认。",
      "更新檢查完成。升級需通過相容檢查並由你確認。",
      "Checks finished. Compatibility approval and your confirmation are required.",
      "確認完了。互換性検証と承認後に更新します。",
      "확인 완료. 호환성 검증 및 사용자 확인 후 업그레이드합니다."
    ],
    "componentFailedLog": [
      "适配组件检测失败；现有环境不变。",
      "適配元件檢查失敗；現有環境不變。",
      "Component check failed; installed runtime unchanged.",
      "適配版の確認失敗。現在の環境は変更しません。",
      "구성 요소 확인 실패. 기존 환경을 유지합니다."
    ],
    "officialFailedLog": [
      "官方版本检测失败；未安装任何更新。",
      "官方版本檢查失敗；未安裝任何更新。",
      "Official check failed; no update installed.",
      "公式版の確認失敗。更新はインストールされていません。",
      "공식 버전 확인 실패. 업데이트를 설치하지 않았습니다."
    ],
    "probePassedLog": [
      "兼容检查通过，请确认后备份并启用组件。",
      "相容檢查通過，請確認後備份並啟用元件。",
      "Compatibility passed. Confirm to back up and activate.",
      "互換性確認済み。承認後にバックアップして有効化します。",
      "호환성 검사 통과. 확인 후 백업하고 적용합니다."
    ],
    "activatedLog": [
      "组件已启用，用户资料保留。准备好后手动启动。",
      "元件已啟用，使用者資料保留。請手動啟動。",
      "Component activated; user data retained. Start when ready.",
      "有効化済み。データは保持されました。手動で起動してください。",
      "구성 요소 적용 완료. 데이터는 유지되며 직접 시작하세요."
    ],
    "stoppedLog": [
      "用户已停止 Agent",
      "使用者已停止 Agent",
      "Agent stopped by user",
      "ユーザーが Agent を停止しました",
      "사용자가 Agent를 중지했습니다"
    ],
    "homePassLog": [
      "现有酒馆资料检查通过：用户文件保留。",
      "現有酒館資料檢查通過：使用者檔案保留。",
      "Existing Tavern data verified; user files preserved.",
      "既存の酒場データを確認。ファイルを保持しました。",
      "기존 Tavern 데이터 확인 완료. 사용자 파일 유지."
    ],
    "libraryLog": [
      "[Studio] 本机资料与参数插件已注册。",
      "[Studio] 本機資料與參數外掛已註冊。",
      "[Studio] Local data and parameter plugin registered.",
      "[Studio] ローカルデータ・設定プラグインを登録しました。",
      "[Studio] 로컬 데이터 및 설정 플러그인 등록 완료."
    ],
    "imageLog": [
      "[Studio] 图片工具已注册；保留 Harness 通用工具。",
      "[Studio] 圖片工具已註冊；保留 Harness 通用工具。",
      "[Studio] Image tools registered; general Harness tools retained.",
      "[Studio] 画像ツール登録済み。一般ツールも利用可能です。",
      "[Studio] 이미지 도구 등록 완료. 일반 Harness 도구 유지."
    ],
    "backupCreated": [
      "备份已创建：",
      "備份已建立：",
      "Backup created: ",
      "バックアップ作成：",
      "백업 생성: "
    ],
    "alreadyInstalled": [
      "当前组件已是此版本。",
      "目前元件已是此版本。",
      "This component is already installed.",
      "この版はインストール済みです。",
      "이미 설치된 구성 요소입니다."
    ],
    "logs": ["运行日志", "執行紀錄", "Runtime logs", "実行ログ", "실행 로그"],
    "noSeed": [
      "此安装包没有内置 Android 运行包描述。",
      "此安裝包沒有內建 Android 執行套件描述。",
      "No bundled Android runtime descriptor.",
      "内蔵 Android 実行環境の定義なし。",
      "내장 Android 런타임 설명이 없습니다."
    ],
    'title': [
      'Android 本地酒馆 Agent',
      'Android 本機酒館 Agent',
      'On-device Tavern Agent',
      'Android ローカル酒場 Agent',
      'Android 로컬 Tavern Agent'
    ],
    'about': [
      '在本机运行，无需 Termux。模型对话仍需配置在线 API；不会自动启动付费任务。',
      '在本機執行，無需 Termux。模型對話仍需設定線上 API；不會自動啟動付費工作。',
      'Runs on this phone without Termux. Model chat still needs an online API. Paid tasks never auto-start.',
      'Termux 不要で端末内実行。モデルとの会話にはオンライン API が必要です。有料タスクは自動開始しません。',
      'Termux 없이 기기에서 실행합니다. 모델 대화에는 온라인 API가 필요합니다. 유료 작업은 자동 시작하지 않습니다.'
    ],
    'unsupported': [
      '需要 Android 8+、ARM64；此设备可继续使用原酒馆。',
      '需要 Android 8+、ARM64；此裝置可繼續使用原酒館。',
      'Requires Android 8+ and ARM64. The existing Tavern remains available.',
      'Android 8 以降・ARM64 が必要です。従来の酒場は引き続き利用できます。',
      'Android 8 이상 및 ARM64가 필요합니다. 기존 Tavern은 계속 사용할 수 있습니다.'
    ],
    'studio': [
      'Studio 适配组件',
      'Studio 適配元件',
      'Studio component',
      'Studio 互換コンポーネント',
      'Studio 호환 구성 요소'
    ],
    'official': [
      'Harness 官方版本',
      'Harness 官方版本',
      'Official Harness',
      'Harness 公式版',
      'Harness 공식 버전'
    ],
    'check': [
      '检查两个更新',
      '檢查兩項更新',
      'Check both channels',
      '両方の更新を確認',
      '두 업데이트 확인'
    ],
    'prepare': [
      '下载 / 继续下载并检查',
      '下載 / 繼續下載並檢查',
      'Download / resume & check',
      'ダウンロード・再開・確認',
      '다운로드 / 재개 및 확인'
    ],
    'downloadHint': [
      '运行环境按需下载；检查更新不下载。已安装环境和酒馆资料在软件更新时保留。下载完成后检查兼容性，再由你确认安装。',
      '執行環境按需下載；檢查更新不下載。已安裝環境與酒館資料在軟體更新時保留。下載後檢查相容性，再由你確認安裝。',
      'Runtime downloads only on request, not during update checks. Installed runtime and Tavern data survive app updates. Compatibility is checked before you confirm installation.',
      '実行環境は必要時のみダウンロードします。更新確認では取得しません。アプリ更新時も環境と酒場データを保持し、互換性確認後にインストールを承認します。',
      '요청할 때만 런타임을 다운로드합니다. 업데이트 확인 시에는 다운로드하지 않습니다. 앱 업데이트 시 환경과 데이터가 유지되며 호환성 검사 후 설치를 확인합니다.'
    ],
    'downloadSize': [
      '运行环境下载大小',
      '執行環境下載大小',
      'Runtime download size',
      '実行環境のダウンロードサイズ',
      '런타임 다운로드 크기'
    ],
    'notPublished': [
      '尚未检测到可下载的兼容运行包，请稍后检查更新。',
      '尚未偵測到可下載的相容執行套件，請稍後檢查更新。',
      'No downloadable compatible runtime found. Check for updates later.',
      'ダウンロード可能な互換パッケージが見つかりません。後で更新を確認してください。',
      '다운로드 가능한 호환 런타임이 없습니다. 나중에 업데이트를 확인하세요.'
    ],
    'pauseDownload': [
      '暂停下载',
      '暫停下載',
      'Pause download',
      'ダウンロードを一時停止',
      '다운로드 일시 중지'
    ],
    'downloading': [
      '正在下载运行环境',
      '正在下載執行環境',
      'Downloading runtime',
      '実行環境をダウンロード中',
      '런타임 다운로드 중'
    ],
    'not_installed': [
      '尚未安装，请先下载并检查',
      '尚未安裝，請先下載並檢查',
      'Not installed; download and check first',
      '未インストール・先にダウンロードして確認',
      '설치되지 않음: 먼저 다운로드 및 확인'
    ],
    'confirm': ['确认升级', '確認升級', 'Confirm upgrade', '更新を確定', '업데이트 확인'],
    'confirmBody': [
      '启动检查通过。升级前自动备份；保留现有会话、插件和配置，不自动启动 Agent。',
      '啟動檢查通過。升級前自動備份；保留現有對話、外掛及設定，不自動啟動 Agent。',
      'Startup check passed. Back up before activation; retain conversations, plugins and settings. Agent will not auto-start.',
      '起動確認済み。更新前にバックアップし、会話・プラグイン・設定を保持します。自動起動しません。',
      '시작 검사 통과. 적용 전 백업하며 대화, 플러그인, 설정을 유지합니다. Agent는 자동 시작하지 않습니다.'
    ],
    'start': ['启动', '啟動', 'Start', '起動', '시작'],
    'stop': ['停止', '停止', 'Stop', '停止', '중지'],
    'open': ['打开酒馆', '開啟酒館', 'Open Tavern', '酒場を開く', 'Tavern 열기'],
    'legacy': [
      '原酒馆与历史资料',
      '原酒館與歷史資料',
      'Existing Tavern & history',
      '従来の酒場・履歴',
      '기존 Tavern 및 기록'
    ],
    'backup': ['立即备份', '立即備份', 'Back up now', '今すぐバックアップ', '지금 백업'],
    'restore': ['恢复备份', '還原備份', 'Restore backup', 'バックアップ復元', '백업 복원'],
    'restoreBody': [
      '先备份当前资料，再恢复所选备份。运行环境不变；不会自动执行任务。',
      '先備份目前資料，再還原所選備份。執行環境不變；不會自動執行工作。',
      'Back up current data, then restore the selected backup. Runtime unchanged; no tasks auto-run.',
      '現在のデータを保存して選択したバックアップを復元します。実行環境は変更せず、タスクを自動実行しません。',
      '현재 데이터를 백업한 후 선택한 백업을 복원합니다. 런타임은 유지되며 작업은 자동 실행되지 않습니다.'
    ],
    'backupsHint': [
      '停止 Agent 后可恢复下方备份。备份和用户资料独立于运行环境，软件升级不覆盖。',
      '停止 Agent 後可還原下方備份。備份與使用者資料獨立於執行環境，軟體升級不覆蓋。',
      'Stop Agent to restore a backup below. Backups and user data are separate from runtime slots and retained on app upgrades.',
      'Agent 停止後に下のバックアップを復元できます。ユーザーデータとバックアップは実行環境から独立し、アプリ更新時も保持します。',
      'Agent를 중지한 후 아래 백업을 복원할 수 있습니다. 백업과 사용자 데이터는 런타임과 분리되며 앱 업데이트 시 유지됩니다.'
    ],
    'cancel': ['取消', '取消', 'Cancel', 'キャンセル', '취소'],
    'approve': ['允许这一次', '允許這一次', 'Allow once', '今回のみ許可', '이번만 허용'],
    'tool': [
      'Agent 请求执行操作',
      'Agent 要求執行操作',
      'Agent requests an action',
      'Agent の操作要求',
      'Agent 작업 요청'
    ],
    'toolHint': [
      '请核对参数；生图等操作可能消耗 Anlas。未确认不执行。',
      '請核對參數；生圖等操作可能消耗 Anlas。未確認不執行。',
      'Review parameters. Image operations may spend Anlas. Nothing runs without approval.',
      'パラメータを確認してください。画像操作は Anlas を消費する場合があります。承認前は実行しません。',
      '매개변수를 확인하세요. 이미지 작업에 Anlas가 사용될 수 있습니다. 승인 전에는 실행하지 않습니다.'
    ],
    'stopped': ['已停止', '已停止', 'Stopped', '停止中', '중지됨'],
    'running': ['运行中', '執行中', 'Running', '実行中', '실행 중'],
    'preparing': [
      '准备与兼容检查中',
      '準備與相容檢查中',
      'Preparing and checking',
      '準備・確認中',
      '준비 및 확인 중'
    ],
    'starting': ['启动中', '啟動中', 'Starting', '起動中', '시작 중'],
    'awaiting_confirmation': [
      '等待确认',
      '等待確認',
      'Awaiting confirmation',
      '確認待ち',
      '확인 대기'
    ],
    'error': [
      '操作失败，请查看日志',
      '操作失敗，請查看紀錄',
      'Action failed; see logs',
      '操作失敗・ログを確認',
      '작업 실패: 로그 확인'
    ],
    'unknown': ['尚未检查', '尚未檢查', 'Not checked', '未確認', '확인 전'],
    'notification': [
      '本地运行中，点击返回 Studio；操作请求需回到软件确认。',
      '本機執行中，點擊返回 Studio；操作要求需回到軟體確認。',
      'Running locally. Tap to return to Studio and review action requests.',
      '端末内で実行中。タップして Studio に戻り、操作要求を確認してください。',
      '로컬 실행 중. 탭하여 Studio로 돌아가 작업 요청을 확인하세요.'
    ],
  };
  final index = switch (normalizeAppLocaleCode(locale)) {
    'zh-TW' => 1,
    'en-US' => 2,
    'ja-JP' => 3,
    'ko-KR' => 4,
    _ => 0
  };
  return text[key]?[index] ?? key;
}

/// Translate application-owned status messages without rewriting raw plugin diagnostics.
String localAgentLog(Object? locale, String line) {
  const keys = {
    'Checking Studio Android component and official Harness separately…':
        'checkingLog',
    'Update checks finished. Changes require a successful compatibility probe and confirmation.':
        'checkedLog',
    'Studio channel check failed; installed runtime unchanged':
        'componentFailedLog',
    'Official Harness check failed; no automatic install': 'officialFailedLog',
    'Compatibility probe passed. Confirm to back up user data and activate this component.':
        'probePassedLog',
    'Runtime activated. User files retained. Start explicitly when ready.':
        'activatedLog',
    'Agent stopped by user': 'stoppedLog',
    'ANDROID HOME PASS: existing user files preserved.': 'homePassLog',
    '[Studio] Live data/configuration plugin registered.': 'libraryLog',
    '[Studio] Image tool plugin registered; general Harness tools remain enabled.':
        'imageLog',
    'No compatible Android component for the latest official Harness; current data retained':
        'officialBlocked',
    'This component is already installed': 'alreadyInstalled',
    'No bundled Android seed in this build': 'noSeed',
    'Compatible Android runtime has not been published yet; check updates later':
        'notPublished',
  };
  if (line.startsWith('ERROR: ')) {
    return '${localAgentText(locale, 'error')}: ${localAgentLog(locale, line.substring(7))}';
  }
  if (line.startsWith('Backup created: ')) {
    return localAgentText(locale, 'backupCreated') + line.substring(16);
  }
  return keys.containsKey(line) ? localAgentText(locale, keys[line]!) : line;
}
