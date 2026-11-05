// Keep new artist tools consistent with the five existing application locales.
String issue81Text(String language, String key) {
  const rows = <String, List<String>>{
    'lookup': ['画师链接／名称检索', '畫師連結／名稱檢索', 'Artist lookup', '画家を検索', '작가 검색'],
    'lookupHint': [
      '输入 Pixiv／X 画师主页或名称，核对 Danbooru 身份后复制 Tag／NAI 画师串。模型不一定识别每位画师。',
      '輸入 Pixiv／X 畫師主頁或名稱，核對身分後複製 Tag／NAI 畫師串。模型不一定識別每位畫師。',
      'Find a Danbooru identity from a Pixiv/X profile or name. Model support is not guaranteed.',
      'Pixiv/X のプロフィールまたは名前から Danbooru の画家を確認。モデル対応は保証されません。',
      'Pixiv/X 프로필 또는 이름으로 Danbooru 작가를 확인합니다. 모델 지원은 보장되지 않습니다.'
    ],
    'input': [
      '画师主页链接或名称',
      '畫師主頁連結或名稱',
      'Artist profile URL or name',
      'プロフィール URL または名前',
      '작가 프로필 URL 또는 이름'
    ],
    'search': ['查询', '查詢', 'Search', '検索', '검색'],
    'noMatch': [
      '未找到可靠匹配；请尝试其他名称或画师主页链接。',
      '未找到可靠配對；請嘗試其他名稱或主頁連結。',
      'No verified match. Try another name or artist profile.',
      '一致する画家が見つかりません。別名やプロフィールを試してください。',
      '확인된 결과가 없습니다. 다른 이름이나 프로필을 입력하세요.'
    ],
    'matches': [
      '逐项核对名称和来源；相似名称不代表同一画师。最多显示 20 项，请细化搜索。',
      '逐項核對名稱和來源；相似名稱不代表同一畫師。最多顯示 20 項，請細化搜尋。',
      'Check each name and source; similar names may identify different artists. Up to 20 matches; refine the query.',
      '名前とリンクを確認してください。同名の別人に注意。最大20件、検索を絞れます。',
      '이름과 출처를 확인하세요. 비슷한 이름은 다른 작가일 수 있습니다. 최대 20개, 검색어를 좁혀주세요.'
    ],
    'copyTag': ['复制 Tag', '複製 Tag', 'Copy tag', 'Tag をコピー', '태그 복사'],
    'copyNai': [
      '复制 NAI 画师串',
      '複製 NAI 畫師串',
      'Copy NAI artist string',
      'NAI 画家列をコピー',
      'NAI 작가 문자열 복사'
    ],
    'copied': ['已复制', '已複製', 'Copied', 'コピーしました', '복사됨'],
    'network': [
      '查询未完成。请检查网络／代理或稍后重试；没有生成虚构匹配。',
      '查詢未完成。請檢查網路／代理或稍後再試；不會產生虛構配對。',
      'Lookup failed. Check network/proxy or try later. No match was invented.',
      '検索失敗。ネットワーク・プロキシを確認し再試行してください。',
      '검색 실패. 네트워크/프록시를 확인하거나 나중에 다시 시도하세요.'
    ],
    'invalid': [
      '仅支持画师名称、Pixiv 用户主页或 X／Twitter 用户主页。',
      '僅支援畫師名稱、Pixiv 使用者主頁或 X／Twitter 主頁。',
      'Use a name, Pixiv user profile, or X/Twitter profile.',
      '名前、Pixiv ユーザーまたは X/Twitter プロフィールを入力してください。',
      '이름, Pixiv 사용자 또는 X/Twitter 프로필을 입력하세요.'
    ],
    'wholePool': [
      '全画师池随机抽卡',
      '全畫師池隨機抽卡',
      'Draw from the whole artist pool',
      '全画家からランダム抽選',
      '전체 작가 풀 무작위 추첨'
    ],
    'wholeHint': [
      '从 Danbooru 全量有效画师范围随机取样，每次抽卡更新；不是仅从热门前 N 名抽取。需联网，失败不冒充全量结果。',
      '從 Danbooru 全部有效畫師隨機取樣，每次抽卡更新。需連線，失敗不冒充全量結果。',
      'Randomly sample all active Danbooru artist tags on each draw, not only the top N. Network required; errors are explicit.',
      '毎回 Danbooru の有効画家タグ全体から抽選。人気上位だけではありません。通信が必要です。',
      '추첨마다 Danbooru 전체 유효 작가 태그에서 표본을 추출합니다. 인터넷이 필요합니다.'
    ],
    'scope': [
      '全池范围 {total} 名 · 本轮随机候选 {count} 名',
      '全池範圍 {total} 名 · 本輪隨機候選 {count} 名',
      'Pool: {total} artists · random sample: {count}',
      '全体 {total} 名・今回の標本 {count} 名',
      '전체 {total}명 · 이번 표본 {count}명'
    ],
    'allFavorites': ['全部收藏', '全部收藏', 'All favorites', 'すべて', '모든 즐겨찾기'],
    'shortlist': ['二次收藏／精选', '二次收藏／精選', 'Shortlist', '厳選', '선별 즐겨찾기'],
    'shortlistAdd': ['加入二次收藏', '加入二次收藏', 'Add to shortlist', '厳選に追加', '선별에 추가'],
    'shortlistRemove': [
      '移出二次收藏（保留原收藏）',
      '移出二次收藏（保留原收藏）',
      'Remove from shortlist (keep favorite)',
      '厳選から外す（お気に入りは保持）',
      '선별에서 제거 (즐겨찾기 유지)'
    ],
    'perPage': ['每页', '每頁', 'Per page', '表示件数', '페이지당'],
    'previous': ['上一页', '上一頁', 'Previous', '前へ', '이전'],
    'next': ['下一页', '下一頁', 'Next', '次へ', '다음'],
    'resume': ['回到上次查看', '回到上次查看', 'Resume last viewed', '前回の位置へ', '마지막 위치로'],
    'page': [
      '第 {page}/{pages} 页 · 共 {total} 项',
      '第 {page}/{pages} 頁 · 共 {total} 項',
      'Page {page}/{pages} · {total} items',
      '{page}/{pages} ページ・{total}件',
      '{page}/{pages} 페이지 · {total}개'
    ],
    'selectedHint': [
      '已选项在此区域内滚动；不会撑长整个页面。',
      '已選項在此區域內捲動，不會撐長整頁。',
      'Selected tags scroll here without expanding the entire page.',
      '選択済みタグはこの枠内でスクロールできます。',
      '선택된 태그는 이 영역 안에서 스크롤됩니다.'
    ],
  };
  final index = switch (language) {
    'zh-TW' => 1,
    'en-US' => 2,
    'ja-JP' => 3,
    'ko-KR' => 4,
    _ => 0
  };
  return rows[key]?[index] ?? key;
}
