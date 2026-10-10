String platformFeatureText(String language,String key) {
  final en=<String,String>{'approve':'Approve execution','customSize':'Custom size (width x height)','engine':'Redraw engine','edit':'OpenAI image edit','configure':'Configure',
    'baseUrl':'API URL','model':'Model','key':'API key','size':'Request size','quality':'Quality','fidelity':'Input fidelity',
    'save':'Save','saved':'Saved','saveFailed':'Not saved. Check configuration.','editBilling':'Provider billing, not Anlas. One request; no automatic retry.',
    'editRunning':'Editing image…','editDone':'Image edit saved','editStopped':'Stopped. Check provider history before resubmitting.',
    'editFailed':'Image edit failed. No automatic resubmission; check provider history.','historyFailed':'Image saved, but history indexing failed. Do not resubmit.',
    'batchEdit':'Batch edit','selectAll':'Select filtered results','clearSelection':'Clear selection','move':'Move to group','delete':'Delete selected',
    'done':'Done','deleteConfirm':'Delete selected images and their records? External originals are kept.',
    'partialDelete':'Some files could not be removed; their records were kept.','refresh':'Refresh',
    'mcp':'External MCP server','enable':'Enable','disable':'Disable','copy':'Copy connection','mcpHint':'Local agents only. Token authentication and in-app approval required.',
    'mcpUnavailable':'MCP server could not be started','cancel':'Cancel'};
  final zh=<String,String>{'approve':'批准执行','customSize':'自定义尺寸（宽x高）','engine':'重绘引擎','edit':'OpenAI 图像编辑','configure':'配置','baseUrl':'接口地址','model':'模型',
    'key':'API 密钥','size':'请求尺寸','quality':'质量','fidelity':'输入保真度','save':'保存','saved':'已保存','saveFailed':'未保存，请检查配置。',
    'editBilling':'由服务商计费，不消耗 Anlas。只提交一次，失败不自动重试。','editRunning':'正在编辑图片…','editDone':'重绘图片已保存',
    'editStopped':'已停止。再次提交前请核对服务商记录。','editFailed':'重绘失败，未自动重发，请核对服务商记录。','historyFailed':'图片已保存，但历史索引失败，请勿重新提交。',
    'batchEdit':'批量编辑','selectAll':'选择筛选结果','clearSelection':'取消选择','move':'移动到分组','delete':'删除所选','done':'完成',
    'deleteConfirm':'删除所选图片及记录？外部导入的原文件会保留。','partialDelete':'部分文件删除失败，已保留对应记录。','refresh':'刷新',
    'mcp':'对外 MCP 服务','enable':'开启','disable':'关闭','copy':'复制连接配置','mcpHint':'仅供本机智能体连接，须密钥认证；写操作需软件内确认。',
    'mcpUnavailable':'MCP 服务启动失败','cancel':'取消'};
  final tw=<String,String>{'approve':'批准執行','customSize':'自訂尺寸（寬x高）','engine':'重繪引擎','edit':'OpenAI 圖像編輯','configure':'設定','baseUrl':'介面位址','model':'模型','key':'API 金鑰',
    'size':'請求尺寸','quality':'品質','fidelity':'輸入保真度','save':'儲存','saved':'已儲存','saveFailed':'未儲存，請檢查設定。',
    'editBilling':'由服務商計費，不消耗 Anlas。只提交一次，失敗不自動重試。','editRunning':'正在編輯圖片…','editDone':'重繪圖片已儲存',
    'editStopped':'已停止。再次提交前請核對服務商紀錄。','editFailed':'重繪失敗，未自動重發，請核對服務商紀錄。','historyFailed':'圖片已儲存，但歷史索引失敗，請勿重新提交。',
    'batchEdit':'批次編輯','selectAll':'選取篩選結果','clearSelection':'取消選取','move':'移到分組','delete':'刪除所選','done':'完成',
    'deleteConfirm':'刪除所選圖片及紀錄？外部匯入的原檔會保留。','partialDelete':'部分檔案刪除失敗，已保留對應紀錄。','refresh':'重新整理',
    'mcp':'對外 MCP 服務','enable':'開啟','disable':'關閉','copy':'複製連線設定','mcpHint':'僅供本機智慧體連線，須金鑰認證；寫入操作需軟體內確認。','mcpUnavailable':'MCP 服務啟動失敗','cancel':'取消'};
  final ja=<String,String>{'approve':'実行を承認','customSize':'カスタムサイズ（幅x高さ）','engine':'編集エンジン','edit':'OpenAI 画像編集','configure':'設定','baseUrl':'API URL','model':'モデル','key':'API キー',
    'size':'リクエストサイズ','quality':'品質','fidelity':'入力忠実度','save':'保存','saved':'保存済み','saveFailed':'保存できません。設定を確認してください。',
    'editBilling':'提供元の料金を使用。Anlas は消費しません。自動再送なし。','editRunning':'画像を編集中…','editDone':'編集画像を保存しました',
    'editStopped':'停止しました。再送前に提供元の履歴を確認してください。','editFailed':'編集に失敗しました。自動再送はしていません。','historyFailed':'画像は保存済みですが、履歴の保存に失敗しました。再送しないでください。',
    'batchEdit':'一括編集','selectAll':'絞り込み結果を選択','clearSelection':'選択を解除','move':'グループへ移動','delete':'選択項目を削除','done':'完了',
    'deleteConfirm':'選択画像と履歴を削除しますか？外部の原本は保持されます。','partialDelete':'削除できなかったファイルの履歴は保持されています。','refresh':'更新',
    'mcp':'外部 MCP サーバー','enable':'有効化','disable':'無効化','copy':'接続設定をコピー','mcpHint':'ローカル専用。トークン認証とアプリ内承認が必要です。','mcpUnavailable':'MCP サーバーを開始できません','cancel':'キャンセル'};
  final ko=<String,String>{'approve':'실행 승인','customSize':'사용자 크기 (너비x높이)','engine':'편집 엔진','edit':'OpenAI 이미지 편집','configure':'설정','baseUrl':'API URL','model':'모델','key':'API 키',
    'size':'요청 크기','quality':'품질','fidelity':'입력 충실도','save':'저장','saved':'저장됨','saveFailed':'저장 실패. 설정을 확인하세요.',
    'editBilling':'제공업체 요금 사용. Anlas 미사용. 자동 재전송 없음.','editRunning':'이미지 편집 중…','editDone':'편집 이미지 저장됨',
    'editStopped':'중지됨. 다시 요청하기 전에 제공업체 기록을 확인하세요.','editFailed':'편집 실패. 자동 재전송하지 않았습니다.','historyFailed':'이미지는 저장됐지만 기록 저장에 실패했습니다. 다시 요청하지 마세요.',
    'batchEdit':'일괄 편집','selectAll':'필터 결과 선택','clearSelection':'선택 해제','move':'그룹으로 이동','delete':'선택 항목 삭제','done':'완료',
    'deleteConfirm':'선택한 이미지와 기록을 삭제할까요? 외부 원본은 유지됩니다.','partialDelete':'삭제하지 못한 파일의 기록은 유지됩니다.','refresh':'새로고침',
    'mcp':'외부 MCP 서버','enable':'켜기','disable':'끄기','copy':'연결 설정 복사','mcpHint':'로컬 전용. 토큰 인증과 앱 내 승인이 필요합니다.','mcpUnavailable':'MCP 서버를 시작할 수 없습니다','cancel':'취소'};
  final values=switch(language){'zh-TW'=>tw,'en-US'=>en,'ja-JP'=>ja,'ko-KR'=>ko,_=>zh};
  return values[key]??en[key]??key;
}
