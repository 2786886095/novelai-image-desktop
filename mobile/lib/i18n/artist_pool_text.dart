import 'app_locales.dart';

String artistPoolText(String language, String key) {
  const values = <String, List<String>>{
    "catalogTitle": ["Danbooru 固定画师镜像库", "Danbooru 固定畫師鏡像庫", "Danbooru artist snapshot", "Danbooru 絵師スナップショット", "Danbooru 작가 스냅샷"],
    "mode": ["抽取方式", "抽取方式", "Selection mode", "抽選方法", "추첨 방식"],
    "ranked": ["热门画师池（按作品数排序）", "熱門畫師池（依作品數排序）", "Popular pool (post count)", "人気プール（投稿数順）", "인기 풀 (작품 수순)"],
    "random": ["全库随机（等概率、不重复）", "全庫隨機（等機率、不重複）", "Whole snapshot (uniform, unique)", "全スナップショット（均等・重複なし）", "전체 스냅샷 (균등·중복 없음)"],
    "selectionCount": ["本次画师池数量", "本次畫師池數量", "Artists in this selection", "今回の絵師プール数", "이번 작가 풀 수"],
    "selectionLimit": ["1–20000；仅限制本次取出的数量，不裁剪镜像全库。", "1–20000；僅限制本次取出數量，不裁切鏡像全庫。", "1–20000 selected artists; the complete snapshot is preserved.", "1～20000人。保存済み全体は削減しません。", "1–20000명 선택. 저장된 전체 스냅샷은 유지됩니다."],
    "snapshot": ["镜像快照 {total} 名 · 本次 {count} 名 · {date}", "鏡像快照 {total} 名 · 本次 {count} 名 · {date}", "Snapshot: {total} · Selected: {count} · {date}", "保存済み {total} 人・選択 {count} 人・{date}", "스냅샷 {total}명 · 선택 {count}명 · {date}"],
    "bundledMirror": ["内置快照 · 离线可用", "內建快照 · 可離線使用", "Bundled snapshot · offline ready", "内蔵スナップショット・オフライン可", "내장 스냅샷 · 오프라인 사용"],
    "downloadedMirror": ["已下载镜像 · 后续抽取不联网", "已下載鏡像 · 後續抽取不連網", "Downloaded snapshot · future draws stay offline", "取得済み・以後の抽選はオフライン", "다운로드됨 · 이후 추첨은 오프라인"],
    "localMirror": ["本地完整镜像（默认）", "本機完整鏡像（預設）", "Complete local snapshot (default)", "完全ローカルスナップショット（既定）", "전체 로컬 스냅샷 (기본)"],
    "selectLocal": ["读取／换一批画师", "讀取／換一批畫師", "Read / reselect artists", "読込／絵師を再抽選", "읽기 / 다시 추첨"],
    "download": ["下载／更新镜像", "下載／更新鏡像", "Download / update snapshot", "スナップショットを取得／更新", "스냅샷 다운로드 / 갱신"],
    "downloadConfirm": ["从本项目 GitHub 镜像下载固定画师快照（当前约 8 MiB），校验完整性后保存到本地；不逐页请求 Danbooru。失败或取消保留旧库，之后抽取不联网。镜像可能早于实时网站数据。", "從本專案 GitHub 下載固定快照（目前約 8 MiB），驗證後存至本機，不逐頁請求 Danbooru。失敗或取消保留舊庫，後續抽取不連網。鏡像可能不是即時資料。", "Download the project GitHub snapshot (currently about 8 MiB), verify and store locally. No paginated Danbooru scan. Failure/cancel keeps the previous pool; later draws stay offline. Snapshot may lag live data.", "本プロジェクトの GitHub から約8 MiBの固定データを検証して保存。Danbooru のページ巡回はしません。失敗・取消時は既存を保持。以後オフライン抽選。最新情報とは限りません。", "프로젝트 GitHub에서 약 8 MiB 스냅샷을 검증해 저장합니다. Danbooru 페이지 순회 없음. 실패/취소 시 기존 풀 유지, 이후 오프라인 추첨. 실시간 자료와 다를 수 있습니다."],
    "cancel": ["取消", "取消", "Cancel", "キャンセル", "취소"],
    "downloading": ["正在下载镜像", "正在下載鏡像", "Downloading snapshot", "取得中", "다운로드 중"],
    "updated": ["镜像已校验并保存，后续抽取离线完成。", "鏡像已驗證並儲存，後續抽取離線完成。", "Snapshot verified and saved. Future draws are offline.", "検証・保存完了。以後オフラインで抽選します。", "스냅샷 검증 및 저장 완료. 이후 오프라인 추첨."],
    "updateFailed": ["镜像未更新（可能取消、网络或校验失败），原有画师库保留；可稍后重试。", "鏡像未更新（可能取消、網路或驗證失敗），保留舊庫，可稍後重試。", "Snapshot not updated (cancelled, network or integrity failure). Previous pool preserved; retry later.", "取得未完了（取消・接続・検証失敗）。既存データは保持。後で再試行できます。", "갱신 실패/취소 또는 검증 오류. 기존 풀 유지. 나중에 재시도하세요."],
    "recovered": ["下载的缓存不可用，已改用内置完整快照；可重新下载。", "下載快取無法使用，已改用內建完整快照，可重新下載。", "Downloaded cache unavailable; using the complete bundled snapshot. You can redownload.", "取得済みデータ不正。内蔵全体に切替済み。再取得できます。", "다운로드 캐시 오류. 내장 전체 스냅샷 사용 중. 다시 다운로드할 수 있습니다."],
    "snapshotHint": ["“全库”指此镜像快照，不是实时全站总量；等概率只针对快照中的画师。仅点击下载才联网。", "「全庫」指此鏡像快照，不是即時全站；等機率僅針對快照內畫師。僅下載時連網。", "Whole pool means this snapshot, not the live site. Uniform sampling applies within it. Only download contacts the mirror.", "全体は保存済みデータで、実サイトの最新総数ではありません。均等抽選は保存内が対象。取得ボタンのみミラー接続。", "전체는 실시간 사이트가 아닌 스냅샷입니다. 균등 추첨도 스냅샷 내부 기준. 다운로드만 미러에 연결합니다."],
    "advanced": ["高级：旧版在线发现", "進階：舊版線上探索", "Advanced: legacy online discovery", "詳細：従来のオンライン探索", "고급: 기존 온라인 탐색"],
    "loadFailed": ["无法读取画师池，请重试或重新下载镜像。", "無法讀取畫師池，請重試或重新下載鏡像。", "Could not read artist pool. Retry or redownload the snapshot.", "絵師プールを読めません。再試行または再取得してください。", "작가 풀을 읽을 수 없습니다. 재시도하거나 스냅샷을 다시 받으세요."],

    'candidates': ['已知画师候选库','已知畫師候選庫','Known artist candidates','既知の絵師候補','알려진 작가 후보'],
    'refresh': ['刷新画师库','重新整理畫師庫','Refresh artist pool','絵師候補を更新','작가 풀 새로고침'],
    'localHint': ['来源：离线画师标签、内置候选及已缓存候选。','來源：離線畫師標籤、內建及已快取候選。','Offline artist tags, bundled candidates and saved candidates.','オフラインタグ・内蔵候補・保存済み候補。','오프라인 작가 태그, 내장 및 캐시 후보.'],
    'whole': [
      '广域画师抽卡',
      '廣域畫師抽卡',
      'Broad artist discovery',
      '広域の絵師抽選',
      '넓은 작가 풀'
    ],
    'hint': [
      '从已知候选随机抽取；不是全站均匀抽样。',
      '從已知候選隨機抽取；不是全站均勻抽樣。',
      'Random known candidates, not uniform sampling of the entire site.',
      '既知の候補から抽選。全サイトの均等抽選ではありません。',
      '알려진 후보 추첨이며 전체 사이트 균등 추첨이 아닙니다.'
    ],
    'source': ['画师库来源', '畫師庫來源', 'Artist pool source', '絵師プールの取得元', '작가 풀 출처'],
    'local': [
      '本地画师库（离线可用）',
      '本機畫師庫（可離線）',
      'Local pool (offline)',
      'ローカル（オフライン可）',
      '로컬 (오프라인)'
    ],
    'online': [
      '在线发现（Danbooru）',
      '線上探索（Danbooru）',
      'Online discovery (Danbooru)',
      'オンライン探索（Danbooru）',
      '온라인 탐색 (Danbooru)'
    ],
    'fallback': [
      '在线服务暂不可用，已改用本地已知候选。可稍后刷新重试。',
      '線上服務暫不可用，已改用本機候選。可稍後重新整理。',
      'Online discovery unavailable; using local known candidates. Refresh to retry.',
      'オンライン取得失敗。ローカル候補を使用中。更新で再試行。',
      '온라인 연결 실패. 로컬 후보 사용 중. 새로고침하여 재시도.'
    ],
    'cache': [
      '已缓存在线候选',
      '已快取線上候選',
      'Cached online candidates',
      '保存済みオンライン候補',
      '캐시된 온라인 후보'
    ],
    'fresh': [
      '本次在线候选',
      '本次線上候選',
      'Fresh online candidates',
      '今回のオンライン候補',
      '새 온라인 후보'
    ],
    'known': [
      '已知候选 {total} 名，本次抽样 {count} 名',
      '已知候選 {total} 名，本次抽樣 {count} 名',
      '{total} known candidates; {count} in this sample',
      '既知の候補 {total} 人・今回 {count} 人',
      '알려진 후보 {total}명 · 이번 표본 {count}명'
    ],
    'fixed': [
      '固定每组画师人数',
      '固定每組畫師人數',
      'Fixed artists per recipe',
      '組み合わせごとの絵師数を固定',
      '조합당 작가 수 고정'
    ],
    'fixedHint': [
      '只固定每组人数，不改变一次抽出的组合数量。候选不足时使用全部候选。',
      '僅固定每組人數，不更改組合數量。候選不足時使用全部候選。',
      'Fixes artists per recipe, not batch size. A smaller pool uses all available candidates.',
      'バッチの組数は変えません。候補不足時は全候補を使用。',
      '배치 수는 변경하지 않습니다. 후보가 부족하면 가능한 후보만 사용합니다.'
    ],
    'artists': [
      '每组画师人数',
      '每組畫師人數',
      'Artists per recipe',
      '組み合わせごとの絵師数',
      '조합당 작가 수'
    ],
    'backupLimit': [
      '备份压缩包最大 4 GiB；单项 JSON 16 MiB、图片 64 MiB。大备份通过系统分享保存，导入前需预留临时磁盘空间。',
      '備份壓縮包最大 4 GiB；單項 JSON 16 MiB、圖片 64 MiB。大型備份透過系統分享儲存，匯入前需預留暫存磁碟空間。',
      'ZIP limit: 4 GiB; each JSON: 16 MiB, image: 64 MiB. Large exports use system sharing. Import needs temporary disk space.',
      'ZIP 上限4 GiB。JSONごと16 MiB、画像ごと64 MiB。大容量の保存はシステム共有。読込には一時ディスク容量が必要です。',
      'ZIP 최대4 GiB, JSON 항목16 MiB, 이미지64 MiB. 대용량 저장은 시스템 공유를 사용하며 가져오기에 임시 디스크 공간이 필요합니다.'
    ],
  };
  final index = switch (normalizeAppLocaleCode(language)) {
    'zh-TW' => 1,
    'en-US' => 2,
    'ja-JP' => 3,
    'ko-KR' => 4,
    _ => 0,
  };
  return values[key]?[index] ?? key;
}
