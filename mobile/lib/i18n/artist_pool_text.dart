import 'app_locales.dart';

String artistPoolText(String language, String key) {
  const values = <String, List<String>>{
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
