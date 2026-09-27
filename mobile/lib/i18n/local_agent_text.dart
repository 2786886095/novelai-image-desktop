import 'app_locales.dart';
String localAgentText(Object? locale,String key) {
  const text=<String,List<String>>{
    'title':['Android 本地酒馆 Agent','Android 本機酒館 Agent','On-device Tavern Agent','Android ローカル酒場 Agent','Android 로컬 Tavern Agent'],
    'about':['在本机运行，无需 Termux。模型对话仍需配置在线 API；不会自动启动付费任务。','在本機執行，無需 Termux。模型對話仍需設定線上 API；不會自動啟動付費工作。','Runs on this phone without Termux. Model chat still needs an online API. Paid tasks never auto-start.','Termux 不要で端末内実行。モデルとの会話にはオンライン API が必要です。有料タスクは自動開始しません。','Termux 없이 기기에서 실행합니다. 모델 대화에는 온라인 API가 필요합니다. 유료 작업은 자동 시작하지 않습니다.'],
    'unsupported':['需要 Android 8+、ARM64；此设备可继续使用原酒馆。','需要 Android 8+、ARM64；此裝置可繼續使用原酒館。','Requires Android 8+ and ARM64. The existing Tavern remains available.','Android 8 以降・ARM64 が必要です。従来の酒場は引き続き利用できます。','Android 8 이상 및 ARM64가 필요합니다. 기존 Tavern은 계속 사용할 수 있습니다.'],
    'studio':['Studio 适配组件','Studio 適配元件','Studio component','Studio 互換コンポーネント','Studio 호환 구성 요소'],
    'official':['Harness 官方版本','Harness 官方版本','Official Harness','Harness 公式版','Harness 공식 버전'],
    'check':['检查两个更新','檢查兩項更新','Check both channels','両方の更新を確認','두 업데이트 확인'],
    'prepare':['准备并检查兼容性','準備並檢查相容性','Prepare & check compatibility','準備・互換性確認','준비 및 호환성 확인'],
    'confirm':['确认升级','確認升級','Confirm upgrade','更新を確定','업데이트 확인'],
    'confirmBody':['启动检查通过。升级前自动备份；保留现有会话、插件和配置，不自动启动 Agent。','啟動檢查通過。升級前自動備份；保留現有對話、外掛及設定，不自動啟動 Agent。','Startup check passed. Back up before activation; retain conversations, plugins and settings. Agent will not auto-start.','起動確認済み。更新前にバックアップし、会話・プラグイン・設定を保持します。自動起動しません。','시작 검사 통과. 적용 전 백업하며 대화, 플러그인, 설정을 유지합니다. Agent는 자동 시작하지 않습니다.'],
    'start':['启动','啟動','Start','起動','시작'],
    'stop':['停止','停止','Stop','停止','중지'],
    'open':['打开酒馆','開啟酒館','Open Tavern','酒場を開く','Tavern 열기'],
    'legacy':['原酒馆与历史资料','原酒館與歷史資料','Existing Tavern & history','従来の酒場・履歴','기존 Tavern 및 기록'],
    'backup':['立即备份','立即備份','Back up now','今すぐバックアップ','지금 백업'],
    'restore':['恢复备份','還原備份','Restore backup','バックアップ復元','백업 복원'],
    'restoreBody':['先备份当前资料，再恢复所选备份。运行环境不变；不会自动执行任务。','先備份目前資料，再還原所選備份。執行環境不變；不會自動執行工作。','Back up current data, then restore the selected backup. Runtime unchanged; no tasks auto-run.','現在のデータを保存して選択したバックアップを復元します。実行環境は変更せず、タスクを自動実行しません。','현재 데이터를 백업한 후 선택한 백업을 복원합니다. 런타임은 유지되며 작업은 자동 실행되지 않습니다.'],
    'backupsHint':['停止 Agent 后可恢复下方备份。备份和用户资料独立于运行环境，软件升级不覆盖。','停止 Agent 後可還原下方備份。備份與使用者資料獨立於執行環境，軟體升級不覆蓋。','Stop Agent to restore a backup below. Backups and user data are separate from runtime slots and retained on app upgrades.','Agent 停止後に下のバックアップを復元できます。ユーザーデータとバックアップは実行環境から独立し、アプリ更新時も保持します。','Agent를 중지한 후 아래 백업을 복원할 수 있습니다. 백업과 사용자 데이터는 런타임과 분리되며 앱 업데이트 시 유지됩니다.'],
    'cancel':['取消','取消','Cancel','キャンセル','취소'],
    'approve':['允许这一次','允許這一次','Allow once','今回のみ許可','이번만 허용'],
    'tool':['Agent 请求执行操作','Agent 要求執行操作','Agent requests an action','Agent の操作要求','Agent 작업 요청'],
    'toolHint':['请核对参数；生图等操作可能消耗 Anlas。未确认不执行。','請核對參數；生圖等操作可能消耗 Anlas。未確認不執行。','Review parameters. Image operations may spend Anlas. Nothing runs without approval.','パラメータを確認してください。画像操作は Anlas を消費する場合があります。承認前は実行しません。','매개변수를 확인하세요. 이미지 작업에 Anlas가 사용될 수 있습니다. 승인 전에는 실행하지 않습니다.'],
    'stopped':['已停止','已停止','Stopped','停止中','중지됨'],
    'running':['运行中','執行中','Running','実行中','실행 중'],
    'preparing':['准备与兼容检查中','準備與相容檢查中','Preparing and checking','準備・確認中','준비 및 확인 중'],
    'starting':['启动中','啟動中','Starting','起動中','시작 중'],
    'awaiting_confirmation':['等待确认','等待確認','Awaiting confirmation','確認待ち','확인 대기'],
    'error':['操作失败，请查看日志','操作失敗，請查看紀錄','Action failed; see logs','操作失敗・ログを確認','작업 실패: 로그 확인'],
    'unknown':['尚未检查','尚未檢查','Not checked','未確認','확인 전'],
    'notification':['本地运行中，点击返回 Studio；操作请求需回到软件确认。','本機執行中，點擊返回 Studio；操作要求需回到軟體確認。','Running locally. Tap to return to Studio and review action requests.','端末内で実行中。タップして Studio に戻り、操作要求を確認してください。','로컬 실행 중. 탭하여 Studio로 돌아가 작업 요청을 확인하세요.'],
  };
  final index=switch(normalizeAppLocaleCode(locale)){'zh-TW'=>1,'en-US'=>2,'ja-JP'=>3,'ko-KR'=>4,_=>0};
  return text[key]?[index] ?? key;
}
