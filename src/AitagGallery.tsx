import { useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from "react";
import {
  AITAG_PAGE_SIZE,
  AITAG_SITE_URL,
  aitagImageUrl,
  aitagMetadataRecord,
  formatAitagMetadata,
  normalizeAitagConfig,
  normalizeAitagDetail,
  normalizeAitagSearch,
  stripAitagHtml,
  type AitagConfig,
  type AitagSort,
  type AitagWorkDetail,
  type AitagWorkSummary,
} from "./aitag";
import { normalizeAppLanguage } from "./i18n";
import { groupLabel, IMPORT_LABELS, parameterLabel } from "./MetadataInspector";
import { inspectImageMetadata } from "./png-meta";
import {
  DEFAULT_GELBOORU_API_KEY,
  DEFAULT_GELBOORU_USER_ID,
  ONLINE_GALLERY_SOURCES,
  onlineGallerySourceInfo,
  type OnlineGalleryDetail,
  type OnlineGalleryItem,
  type OnlineGalleryPage,
  type OnlineGallerySourceId,
} from "./online-gallery";
import { useAppStore } from "./store";
import type { ArtistStylePreviewPage, ArtistStylePreviewResult, ImportedParams } from "./types";
import type { ArtistTagRecord } from "./artist-lab";
import { AppPortal, SelectMenu, SelectMenuCompat } from "./components/ui";

const COPY_RESET_MS = 1_500;
const COMPATIBLE_SELECTION_KEY = "langbai.aitag.compatible-params.v1";
export const AITAG_CACHE_RETENTION_KEY = "langbai.aitag.cache-retention-days.v1";
const COMPATIBLE_PARAM_KEYS = Object.keys(IMPORT_LABELS) as (keyof ImportedParams)[];
const ONLINE_GALLERY_SOURCE_KEY = "langbai.online-gallery.source.v1";
const GALLERY_PAGE_SIZE_KEY = "langbai.online-gallery.page-size.v1";
const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 48, 60] as const;
const DEFAULT_GALLERY_PAGE_SIZE = 12;
const ARTIST_PREVIEW_PAGE_SIZE = 12;

function loadGalleryPageSize() {
  const stored = Number(globalThis.localStorage?.getItem(GALLERY_PAGE_SIZE_KEY));
  return GALLERY_PAGE_SIZE_OPTIONS.includes(stored as (typeof GALLERY_PAGE_SIZE_OPTIONS)[number])
    ? stored
    : DEFAULT_GALLERY_PAGE_SIZE;
}

function scrollGalleryPageToTop(page: HTMLElement | null) {
  page?.scrollTo({ top: 0, behavior: "smooth" });
}

function loadCompatibleSelection(): Set<keyof ImportedParams> {
  try {
    const raw = localStorage.getItem(COMPATIBLE_SELECTION_KEY);
    if (!raw) return new Set(COMPATIBLE_PARAM_KEYS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(COMPATIBLE_PARAM_KEYS);
    return new Set(parsed.filter((key): key is keyof ImportedParams =>
      typeof key === "string" && COMPATIBLE_PARAM_KEYS.includes(key as keyof ImportedParams)));
  } catch {
    return new Set(COMPATIBLE_PARAM_KEYS);
  }
}

const TEXT = {
  "zh-CN": {
    title: "在线画廊",
    subtitle: "当前来源：AITag。搜索、浏览公开作品并查看生成原参数。",
    back: "返回工具",
    source: "打开 AITag 网站",
    query: "搜索作品、作者、标签、模型或 ID",
    prompt: "搜索正向提示词（可选）",
    search: "搜索",
    refresh: "刷新",
    newest: "最新作品",
    monthly: "本月排行",
    timeRange: "时间范围",
    allTime: "全部时间",
    fullYear: "{year} 全年",
    quarter: "{year} 年第 {quarter} 季度",
    currentMonth: "当前月份",
    older: "更早作品",
    loading: "正在读取 AITag 数据…",
    failed: "读取失败，请检查网络后重试。",
    retry: "重试",
    empty: "没有找到匹配的作品",
    total: "共 {count} 个作品",
    previous: "上一页",
    next: "下一页",
    page: "第 {page} 页",
    images: "{count} 张",
    views: "浏览 {count}",
    bookmarks: "收藏 {count}",
    detailBack: "返回搜索结果",
    workId: "作品 ID",
    author: "作者 ID",
    created: "发布时间",
    aiType: "生成类型",
    model: "模型",
    metadata: "图片原数据",
    promptText: "提示词文本",
    noMetadata: "该图片没有公开的生成原数据。",
    copy: "复制",
    copied: "已复制",
    image: "图片 {index}",
    use: "一键使用到生成",
    compatible: "可用兼容参数 {count} 项",
    compatibleSettings: "兼容参数复用设置",
    selectedCompatible: "已选择 {selected}/{total} 项",
    selectAll: "全选",
    clearAll: "清空",
    noSelected: "请至少勾选一个兼容参数",
    gallerySource: "画廊来源", artistTitle: "画师排行榜", artistSubtitle: "收录 Danbooru 全部有效画师标签，并按作品数排序；作品数代表收录量与热度，不代表画师质量。", updated: "更新", neverUpdated: "尚未更新", manualUpdate: "手动更新", openDanbooru: "打开 Danbooru", artistSearch: "搜索画师 Tag", artistCount: "共 {count} 位画师", artistPageSize: "每页 {count} 位画师", loadingArtists: "正在读取画师排行…", works: "作品", copyArtistTag: "复制画师 Tag", copyTag: "复制 Tag", openArtistLibrary: "打开该画师作品库", library: "作品库 ↗", loadingPreviews: "正在读取代表作品…", noPreviews: "暂无可用参考图", previewHint: "双击全屏预览", previewPage: "第 {page} / {pages} 页 · 每页 12 张", rankingPage: "第 {page} / {pages} 页 · {start}–{end} / {total}", rankingPagination: "画师排行榜分页", itemsPerPage: "每页数量", choosePage: "选择页数", pagePosition: "第 {page} / {pages} 页", loadingPage: "正在准备第 {page} 页…", closePreview: "关闭预览", previousImage: "上一张", nextImage: "下一张", openSourcePage: "打开来源页面", rating: "内容分级", size: "尺寸", negativePrompt: "负面提示词", note: "说明", backCollections: "返回图鉴列表", openSourceSite: "打开来源网站", safeOnly: "仅显示全年龄", loadingSource: "正在读取 {source} 数据…", artistPreviewLabel: "{artist} 代表作品 {index}", artistLightbox: "{artist} 作品预览",
    sourceNotice: "数据与图片来自 AITag；接口结构变更时可能暂时不可用。",
    unavailableImage: "图片不可用", imageLoading: "加载中", codex: "法典", imageCount: "{count} 张配图", openCollection: "点击进入图鉴", score: "评分 {count}", invalidCredentials: "Gelbooru 凭据无效或已失效，请检查 User ID 与 API Key。", sourceFailed: "读取该来源失败，请检查网络或稍后重试。", detailFailed: "无法打开作品详情，请稍后重试。", tagArtists: "艺术家", tagCharacters: "角色", tagCopyrights: "作品", tagGeneral: "通用", tagMetadata: "元数据", sourceDescription: "当前来源：{source}。点击卡片可查看完整图片、标签与可用提示词。", searchCollections: "搜索图鉴、标题、作者或提示词", searchTags: "搜索标签，多个标签用空格分隔", resultCount: "{count} 个结果", resultTotal: "共 {count} 个结果",
  },
  "zh-TW": {
    title: "線上畫廊",
    subtitle: "目前來源：AITag。搜尋、瀏覽公開作品並查看生成原參數。",
    back: "返回工具",
    source: "開啟 AITag 網站",
    query: "搜尋作品、作者、標籤、模型或 ID",
    prompt: "搜尋正向提示詞（可選）",
    search: "搜尋",
    refresh: "重新整理",
    newest: "最新作品",
    monthly: "本月排行",
    timeRange: "時間範圍",
    allTime: "全部時間",
    fullYear: "{year} 全年",
    quarter: "{year} 年第 {quarter} 季度",
    currentMonth: "目前月份",
    older: "更早作品",
    loading: "正在讀取 AITag 資料…",
    failed: "讀取失敗，請檢查網路後重試。",
    retry: "重試",
    empty: "找不到符合的作品",
    total: "共 {count} 個作品",
    previous: "上一頁",
    next: "下一頁",
    page: "第 {page} 頁",
    images: "{count} 張",
    views: "瀏覽 {count}",
    bookmarks: "收藏 {count}",
    detailBack: "返回搜尋結果",
    workId: "作品 ID",
    author: "作者 ID",
    created: "發佈時間",
    aiType: "生成類型",
    model: "模型",
    metadata: "圖片原始資料",
    promptText: "提示詞文字",
    noMetadata: "此圖片沒有公開的生成原始資料。",
    copy: "複製",
    copied: "已複製",
    image: "圖片 {index}",
    use: "一鍵套用到生成",
    compatible: "可用相容參數 {count} 項",
    compatibleSettings: "相容參數重用設定",
    selectedCompatible: "已選擇 {selected}/{total} 項",
    selectAll: "全選",
    clearAll: "清除",
    noSelected: "請至少勾選一個相容參數",
    gallerySource: "畫廊來源", artistTitle: "畫師排行榜", artistSubtitle: "收錄 Danbooru 全部有效畫師標籤並依作品數排序；作品數代表收錄量與熱度，不代表畫師品質。", updated: "更新", neverUpdated: "尚未更新", manualUpdate: "手動更新", openDanbooru: "開啟 Danbooru", artistSearch: "搜尋畫師 Tag", artistCount: "共 {count} 位畫師", artistPageSize: "每頁 {count} 位畫師", loadingArtists: "正在讀取畫師排行…", works: "作品", copyArtistTag: "複製畫師 Tag", copyTag: "複製 Tag", openArtistLibrary: "開啟該畫師作品庫", library: "作品庫 ↗", loadingPreviews: "正在讀取代表作品…", noPreviews: "暫無可用參考圖", previewHint: "按兩下全螢幕預覽", previewPage: "第 {page} / {pages} 頁 · 每頁 12 張", rankingPage: "第 {page} / {pages} 頁 · {start}–{end} / {total}", rankingPagination: "畫師排行榜分頁", itemsPerPage: "每頁數量", choosePage: "選擇頁數", pagePosition: "第 {page} / {pages} 頁", loadingPage: "正在準備第 {page} 頁…", closePreview: "關閉預覽", previousImage: "上一張", nextImage: "下一張", openSourcePage: "開啟來源頁面", rating: "內容分級", size: "尺寸", negativePrompt: "負面提示詞", note: "說明", backCollections: "返回圖鑑清單", openSourceSite: "開啟來源網站", safeOnly: "僅顯示全年齡", loadingSource: "正在讀取 {source} 資料…", artistPreviewLabel: "{artist} 代表作品 {index}", artistLightbox: "{artist} 作品預覽",
    sourceNotice: "資料與圖片來自 AITag；介面結構變更時可能暫時無法使用。",
    unavailableImage: "圖片無法使用", imageLoading: "載入中", codex: "圖鑑", imageCount: "{count} 張配圖", openCollection: "按一下進入圖鑑", score: "評分 {count}", invalidCredentials: "Gelbooru 憑證無效或已失效，請檢查 User ID 與 API Key。", sourceFailed: "讀取此來源失敗，請檢查網路或稍後重試。", detailFailed: "無法開啟作品詳情，請稍後重試。", tagArtists: "藝術家", tagCharacters: "角色", tagCopyrights: "作品", tagGeneral: "一般", tagMetadata: "中繼資料", sourceDescription: "目前來源：{source}。按一下卡片可查看完整圖片、標籤與可用提示詞。", searchCollections: "搜尋圖鑑、標題、作者或提示詞", searchTags: "搜尋標籤，多個標籤以空格分隔", resultCount: "{count} 個結果", resultTotal: "共 {count} 個結果",
  },
  "en-US": {
    title: "Online Gallery",
    subtitle: "Current source: AITag. Search public works and inspect their generation metadata.",
    back: "Back to Tools",
    source: "Open AITag",
    query: "Search works, creators, tags, models, or IDs",
    prompt: "Search positive prompts (optional)",
    search: "Search",
    refresh: "Refresh",
    newest: "Newest",
    monthly: "Monthly Rank",
    timeRange: "Time range",
    allTime: "All time",
    fullYear: "{year} (full year)",
    quarter: "{year} Q{quarter}",
    currentMonth: "Current month",
    older: "Older works",
    loading: "Loading AITag data…",
    failed: "Could not load data. Check your network and try again.",
    retry: "Retry",
    empty: "No matching works found",
    total: "{count} works",
    previous: "Previous",
    next: "Next",
    page: "Page {page}",
    images: "{count} images",
    views: "{count} views",
    bookmarks: "{count} bookmarks",
    detailBack: "Back to results",
    workId: "Work ID",
    author: "Creator ID",
    created: "Published",
    aiType: "AI Type",
    model: "Model",
    metadata: "Original Image Metadata",
    promptText: "Prompt Text",
    noMetadata: "No public generation metadata is available for this image.",
    copy: "Copy",
    copied: "Copied",
    image: "Image {index}",
    use: "Use in Generate",
    compatible: "{count} compatible values",
    compatibleSettings: "Compatible parameters to reuse",
    selectedCompatible: "{selected}/{total} selected",
    selectAll: "Select all",
    clearAll: "Clear all",
    noSelected: "Select at least one compatible parameter",
    gallerySource: "Gallery source", artistTitle: "Artist ranking", artistSubtitle: "Includes every active Danbooru artist tag and ranks them by indexed works. Counts indicate volume and popularity, not artist quality.", updated: "Updated", neverUpdated: "Not updated yet", manualUpdate: "Update now", openDanbooru: "Open Danbooru", artistSearch: "Search artist tags", artistCount: "{count} artists total", artistPageSize: "{count} artists per page", loadingArtists: "Loading artist ranking…", works: "works", copyArtistTag: "Copy artist tag", copyTag: "Copy tag", openArtistLibrary: "Open this artist's library", library: "Library ↗", loadingPreviews: "Loading representative works…", noPreviews: "No reference images available", previewHint: "Double-click for full-screen preview", previewPage: "Page {page} of {pages} · 12 per page", rankingPage: "Page {page} of {pages} · {start}–{end} / {total}", rankingPagination: "Artist ranking pages", itemsPerPage: "Items per page", choosePage: "Choose page", pagePosition: "Page {page} of {pages}", loadingPage: "Preparing page {page}…", closePreview: "Close preview", previousImage: "Previous image", nextImage: "Next image", openSourcePage: "Open source page", rating: "Rating", size: "Size", negativePrompt: "Negative prompt", note: "Notes", backCollections: "Back to collections", openSourceSite: "Open source website", safeOnly: "Safe content only", loadingSource: "Loading {source} data…", artistPreviewLabel: "{artist} representative work {index}", artistLightbox: "{artist} work preview",
    sourceNotice: "Data and images are provided by AITag; availability may change with its API.",
    unavailableImage: "Image unavailable", imageLoading: "Loading", codex: "Collection", imageCount: "{count} images", openCollection: "Open collection", score: "Score {count}", invalidCredentials: "The Gelbooru credentials are invalid or expired. Check the User ID and API key.", sourceFailed: "Could not load this source. Check the network and try again.", detailFailed: "Could not open the work details. Try again later.", tagArtists: "Artists", tagCharacters: "Characters", tagCopyrights: "Copyrights", tagGeneral: "General", tagMetadata: "Metadata", sourceDescription: "Current source: {source}. Open a card to view the full image, tags, and reusable prompt.", searchCollections: "Search collections, titles, authors, or prompts", searchTags: "Search tags separated by spaces", resultCount: "{count} results", resultTotal: "{count} results total",
  },
  "ja-JP": {
    title: "オンラインギャラリー",
    subtitle: "現在のソース：AITag。公開作品を検索し、生成パラメータを確認できます。",
    back: "ツールへ戻る",
    source: "AITag を開く",
    query: "作品、作者、タグ、モデル、ID を検索",
    prompt: "ポジティブプロンプトを検索（任意）",
    search: "検索",
    refresh: "更新",
    newest: "新着作品",
    monthly: "月間ランキング",
    timeRange: "期間",
    allTime: "全期間",
    fullYear: "{year} 年通年",
    quarter: "{year} 年 Q{quarter}",
    currentMonth: "今月",
    older: "以前の作品",
    loading: "AITag データを読み込み中…",
    failed: "読み込めませんでした。ネットワークを確認して再試行してください。",
    retry: "再試行",
    empty: "一致する作品がありません",
    total: "全 {count} 作品",
    previous: "前のページ",
    next: "次のページ",
    page: "{page} ページ",
    images: "{count} 枚",
    views: "閲覧 {count}",
    bookmarks: "ブックマーク {count}",
    detailBack: "検索結果へ戻る",
    workId: "作品 ID",
    author: "作者 ID",
    created: "公開日時",
    aiType: "生成タイプ",
    model: "モデル",
    metadata: "画像の生成データ",
    promptText: "プロンプトテキスト",
    noMetadata: "この画像には公開された生成データがありません。",
    copy: "コピー",
    copied: "コピー済み",
    image: "画像 {index}",
    use: "生成画面で使用",
    compatible: "互換設定 {count} 件",
    compatibleSettings: "再利用する互換設定",
    selectedCompatible: "{selected}/{total} 件を選択",
    selectAll: "すべて選択",
    clearAll: "すべて解除",
    noSelected: "互換設定を1つ以上選択してください",
    gallerySource: "ギャラリーソース", artistTitle: "画家ランキング", artistSubtitle: "Danbooru の有効な画家タグをすべて収録し、作品数で並べています。作品数は収録量と人気の目安で、画家の品質評価ではありません。", updated: "更新", neverUpdated: "未更新", manualUpdate: "今すぐ更新", openDanbooru: "Danbooru を開く", artistSearch: "画家タグを検索", artistCount: "全 {count} 人の画家", artistPageSize: "1ページ {count} 人", loadingArtists: "画家ランキングを読み込み中…", works: "作品", copyArtistTag: "画家タグをコピー", copyTag: "タグをコピー", openArtistLibrary: "この画家の作品一覧を開く", library: "作品一覧 ↗", loadingPreviews: "代表作品を読み込み中…", noPreviews: "参照画像がありません", previewHint: "ダブルクリックで全画面プレビュー", previewPage: "{page} / {pages} ページ・1 ページ 12 枚", rankingPage: "{page} / {pages} ページ・{start}–{end} / {total}", rankingPagination: "画家ランキングのページ", itemsPerPage: "1ページの件数", choosePage: "ページを選択", pagePosition: "{page} / {pages} ページ", loadingPage: "{page}ページを準備中…", closePreview: "プレビューを閉じる", previousImage: "前の画像", nextImage: "次の画像", openSourcePage: "ソースページを開く", rating: "レーティング", size: "サイズ", negativePrompt: "ネガティブプロンプト", note: "説明", backCollections: "図鑑一覧へ戻る", openSourceSite: "ソースサイトを開く", safeOnly: "全年齢のみ", loadingSource: "{source} データを読み込み中…", artistPreviewLabel: "{artist} の代表作品 {index}", artistLightbox: "{artist} の作品プレビュー",
    sourceNotice: "データと画像は AITag 提供です。API 変更時は一時的に利用できない場合があります。",
    unavailableImage: "画像を利用できません", imageLoading: "読み込み中", codex: "図鑑", imageCount: "画像 {count} 枚", openCollection: "図鑑を開く", score: "スコア {count}", invalidCredentials: "Gelbooru の認証情報が無効か期限切れです。User ID と API Key を確認してください。", sourceFailed: "このソースを読み込めません。ネットワークを確認して再試行してください。", detailFailed: "作品の詳細を開けません。後でもう一度お試しください。", tagArtists: "画家", tagCharacters: "キャラクター", tagCopyrights: "作品", tagGeneral: "一般", tagMetadata: "メタデータ", sourceDescription: "現在のソース：{source}。カードから画像・タグ・利用可能なプロンプトを確認できます。", searchCollections: "図鑑・タイトル・作者・プロンプトを検索", searchTags: "タグをスペース区切りで検索", resultCount: "{count} 件", resultTotal: "全 {count} 件",
  },
  "ko-KR": {
    title: "온라인 갤러리",
    subtitle: "현재 소스: AITag. 공개 작품을 검색하고 생성 매개변수를 확인합니다.",
    back: "도구로 돌아가기",
    source: "AITag 열기",
    query: "작품, 작가, 태그, 모델 또는 ID 검색",
    prompt: "긍정 프롬프트 검색(선택 사항)",
    search: "검색",
    refresh: "새로고침",
    newest: "최신 작품",
    monthly: "월간 순위",
    timeRange: "기간",
    allTime: "전체 기간",
    fullYear: "{year}년 전체",
    quarter: "{year}년 {quarter}분기",
    currentMonth: "이번 달",
    older: "이전 작품",
    loading: "AITag 데이터를 불러오는 중…",
    failed: "데이터를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도하세요.",
    retry: "다시 시도",
    empty: "일치하는 작품이 없습니다",
    total: "총 {count}개 작품",
    previous: "이전 페이지",
    next: "다음 페이지",
    page: "{page}페이지",
    images: "{count}장",
    views: "조회 {count}",
    bookmarks: "북마크 {count}",
    detailBack: "검색 결과로 돌아가기",
    workId: "작품 ID",
    author: "작가 ID",
    created: "게시 시간",
    aiType: "생성 유형",
    model: "모델",
    metadata: "이미지 원본 데이터",
    promptText: "프롬프트 텍스트",
    noMetadata: "이 이미지에는 공개된 생성 원본 데이터가 없습니다.",
    copy: "복사",
    copied: "복사됨",
    image: "이미지 {index}",
    use: "생성 화면에서 사용",
    compatible: "호환 값 {count}개",
    compatibleSettings: "재사용할 호환 매개변수",
    selectedCompatible: "{selected}/{total}개 선택",
    selectAll: "전체 선택",
    clearAll: "전체 해제",
    noSelected: "호환 매개변수를 하나 이상 선택하세요",
    gallerySource: "갤러리 소스", artistTitle: "작가 순위", artistSubtitle: "Danbooru의 모든 활성 작가 태그를 수록하고 작품 수로 정렬합니다. 작품 수는 수록량과 인기도를 나타내며 작가 품질 평가는 아닙니다.", updated: "업데이트", neverUpdated: "아직 업데이트되지 않음", manualUpdate: "지금 업데이트", openDanbooru: "Danbooru 열기", artistSearch: "작가 태그 검색", artistCount: "총 작가 {count}명", artistPageSize: "페이지당 작가 {count}명", loadingArtists: "작가 순위 불러오는 중…", works: "작품", copyArtistTag: "작가 태그 복사", copyTag: "태그 복사", openArtistLibrary: "작가 작품 라이브러리 열기", library: "작품 라이브러리 ↗", loadingPreviews: "대표 작품 불러오는 중…", noPreviews: "사용 가능한 참고 이미지 없음", previewHint: "두 번 클릭해 전체 화면 미리보기", previewPage: "{page} / {pages}페이지 · 페이지당 12장", rankingPage: "{page} / {pages}페이지 · {start}–{end} / {total}", rankingPagination: "작가 순위 페이지", itemsPerPage: "페이지당 항목", choosePage: "페이지 선택", pagePosition: "{page} / {pages}페이지", loadingPage: "{page}페이지 준비 중…", closePreview: "미리보기 닫기", previousImage: "이전 이미지", nextImage: "다음 이미지", openSourcePage: "원본 페이지 열기", rating: "등급", size: "크기", negativePrompt: "부정 프롬프트", note: "설명", backCollections: "도감 목록으로", openSourceSite: "원본 사이트 열기", safeOnly: "전체 이용가만", loadingSource: "{source} 데이터 불러오는 중…", artistPreviewLabel: "{artist} 대표 작품 {index}", artistLightbox: "{artist} 작품 미리보기",
    sourceNotice: "데이터와 이미지는 AITag에서 제공되며 API 변경 시 일시적으로 사용할 수 없을 수 있습니다.",
    unavailableImage: "이미지를 사용할 수 없음", imageLoading: "불러오는 중", codex: "도감", imageCount: "이미지 {count}장", openCollection: "도감 열기", score: "점수 {count}", invalidCredentials: "Gelbooru 인증 정보가 잘못되었거나 만료되었습니다. User ID와 API Key를 확인하세요.", sourceFailed: "이 소스를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도하세요.", detailFailed: "작품 상세 정보를 열지 못했습니다. 잠시 후 다시 시도하세요.", tagArtists: "작가", tagCharacters: "캐릭터", tagCopyrights: "작품", tagGeneral: "일반", tagMetadata: "메타데이터", sourceDescription: "현재 소스: {source}. 카드를 열어 전체 이미지, 태그, 재사용 가능한 프롬프트를 확인하세요.", searchCollections: "도감, 제목, 작가 또는 프롬프트 검색", searchTags: "태그를 공백으로 구분해 검색", resultCount: "결과 {count}개", resultTotal: "총 {count}개 결과",
  },
} as const;

type GalleryText = (typeof TEXT)[keyof typeof TEXT];

function GalleryPageNumberInput({ page, pageCount, disabled, onChange, text }: { page: number; pageCount?: number; disabled: boolean; onChange: (page: number) => void; text: GalleryText }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => { setDraft(String(page)); }, [page]);
  const submit = () => {
    const requested = Math.max(1, Math.floor(Number(draft) || page));
    const target = pageCount ? Math.min(pageCount, requested) : requested;
    setDraft(String(target));
    onChange(target);
  };
  return <div className="gallery-page-number-input"><input type="number" min="1" max={pageCount} step="1" value={draft} disabled={disabled} aria-label={text.choosePage} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} /><button type="button" className="btn secondary" disabled={disabled} onClick={submit}>{text.choosePage}</button></div>;
}

// Keep the gallery session outside React. ToolsHub is intentionally unmounted
// when the user visits Generate/Redraw, but returning should feel like switching
// tabs, not like reopening a remote website.
const gallerySession = {
  loaded: false,
  config: normalizeAitagConfig({}),
  query: "",
  prompt: "",
  sort: "new" as AitagSort,
  timeRange: "all",
  page: 1,
  result: normalizeAitagSearch({}),
  selected: null as AitagWorkDetail | null,
  selectedImage: 0,
};
const galleryDetailCache = new Map<number, Promise<AitagWorkDetail>>();

function interpolate(value: string, key: string, replacement: string | number) {
  return value.replace(`{${key}}`, String(replacement));
}

function formatText(value: string, replacements: Record<string, string | number>) {
  return Object.entries(replacements).reduce((result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)), value);
}

function localizedGallerySourceLabel(source: OnlineGallerySourceId, text: GalleryText) {
  if (source === "artist-ranking") return text.artistTitle;
  if (source === "quicktag") return text.codex;
  return onlineGallerySourceInfo(source).label;
}

function CopyButton({ value, text }: { value: string; text: GalleryText }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_RESET_MS);
  };
  return (
    <button type="button" className="btn secondary compact" onClick={() => void copy()} disabled={!value}>
      {copied ? text.copied : text.copy}
    </button>
  );
}

function loadGallerySource(): OnlineGallerySourceId {
  const stored = localStorage.getItem(ONLINE_GALLERY_SOURCE_KEY);
  return ONLINE_GALLERY_SOURCES.some((source) => source.id === stored)
    ? stored as OnlineGallerySourceId
    : "aitag";
}

function GallerySourcePicker({
  value,
  onChange,
  text,
}: {
  value: OnlineGallerySourceId;
  onChange: (value: OnlineGallerySourceId) => void;
  text: GalleryText;
}) {
  return (
    <div className="online-gallery-source-picker">
      <SelectMenu
        value={value}
        ariaLabel={text.gallerySource}
        label={text.gallerySource}
        className="online-gallery-source-menu"
        options={ONLINE_GALLERY_SOURCES.map((source) => ({ value: source.id, label: localizedGallerySourceLabel(source.id, text) }))}
        onChange={(source) => onChange(source as OnlineGallerySourceId)}
      />
    </div>
  );
}

function ArtistRankingGallery({
  onSourceChange,
  onBack,
  text,
}: {
  onSourceChange: (source: OnlineGallerySourceId) => void;
  onBack?: () => void;
  text: GalleryText;
}) {
  const pageRef = useRef<HTMLElement>(null);
  const [artists, setArtists] = useState<ArtistTagRecord[]>([]);
  const [artistTotal, setArtistTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadGalleryPageSize);
  const [pendingRankingPage, setPendingRankingPage] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [previews, setPreviews] = useState<Record<number, ArtistStylePreviewResult | null>>({});
  const [previewPages, setPreviewPages] = useState<Record<string, ArtistStylePreviewPage>>({});
  const [previewPageByArtist, setPreviewPageByArtist] = useState<Record<number, number>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<number, boolean>>({});
  const [previewPendingPage, setPreviewPendingPage] = useState<Record<number, number | undefined>>({});
  const [previewLightbox, setPreviewLightbox] = useState<{
    artist: string;
    items: ArtistStylePreviewResult[];
    index: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(0);
  const rankingRequest = useRef(0);
  const rankingQueryReady = useRef(false);

  const load = useCallback(async (
    force = false,
    targetPage = 1,
    targetPageSize = pageSize,
    targetQuery = query,
  ) => {
    const request = ++rankingRequest.current;
    setLoading(true);
    setError("");
    try {
      const snapshot = await window.naiDesktop.artistLabArtistRanking(targetPage, targetPageSize, targetQuery, force);
      if (request !== rankingRequest.current) return;
      setArtists(snapshot.items);
      setArtistTotal(snapshot.total);
      setPage(snapshot.page);
      setPageSize(snapshot.pageSize);
      setUpdatedAt(snapshot.savedAt);
    } catch (reason) {
      if (request !== rankingRequest.current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (request === rankingRequest.current) setLoading(false);
    }
  }, [pageSize, query]);

  useEffect(() => { void load(false, 1, pageSize, ""); /* initial ranking */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rankingQueryReady.current) {
      rankingQueryReady.current = true;
      return;
    }
    const timer = window.setTimeout(() => void load(false, 1, pageSize, query), 350);
    return () => window.clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { globalThis.localStorage?.setItem(GALLERY_PAGE_SIZE_KEY, String(pageSize)); }, [pageSize]);

  const pageCount = Math.max(1, Math.ceil(artistTotal / pageSize));
  const rows = artists;
  const rowSignature = rows.map((artist) => artist.id).join(",");
  const ranks = useMemo(() => new Map(rows.map((artist, index) => [artist.id, (page - 1) * pageSize + index + 1])), [page, pageSize, rows]);

  // Populate visible rows progressively instead of waiting for every row to be
  // expanded. Four workers avoid freezing the gallery with a request burst.
  useEffect(() => {
    let cancelled = false;
    let cursor = 0;
    const pending = rows.filter((artist) => !Object.prototype.hasOwnProperty.call(previews, artist.id));
    if (pending.length === 0) return () => { cancelled = true; };
    const workers = Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (!cancelled) {
        const artist = pending[cursor++];
        if (!artist) return;
        const preview = await window.naiDesktop.artistLabStylePreview(artist.name).catch(() => null);
        if (!cancelled) {
          setPreviews((current) => Object.prototype.hasOwnProperty.call(current, artist.id)
            ? current
            : { ...current, [artist.id]: preview });
        }
      }
    });
    void Promise.all(workers);
    return () => { cancelled = true; };
    // rowSignature tracks pagination/search without restarting after each preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSignature]);
  useEffect(() => {
    if (!previewLightbox) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewLightbox(null);
      if (event.key === "ArrowLeft") {
        setPreviewLightbox((current) => current ? { ...current, index: Math.max(0, current.index - 1) } : current);
      }
      if (event.key === "ArrowRight") {
        setPreviewLightbox((current) => current ? { ...current, index: Math.min(current.items.length - 1, current.index + 1) } : current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewLightbox]);

  const loadPreviewPage = async (artist: ArtistTagRecord, targetPage: number) => {
    const key = `${artist.id}:${targetPage}`;
    if (previewPages[key] || previewLoading[artist.id]) return;
    setPreviewLoading((current) => ({ ...current, [artist.id]: true }));
    try {
      const result = await window.naiDesktop.artistLabStylePreviewPage(
        artist.name,
        targetPage,
        ARTIST_PREVIEW_PAGE_SIZE,
      );
      setPreviewPages((current) => ({ ...current, [key]: result }));
    } catch {
      setPreviewPages((current) => ({
        ...current,
        [key]: {
          tag: artist.name,
          page: targetPage,
          pageSize: ARTIST_PREVIEW_PAGE_SIZE,
          total: 0,
          hasMore: false,
          items: [],
        },
      }));
    } finally {
      setPreviewLoading((current) => ({ ...current, [artist.id]: false }));
    }
  };

  const changePreviewPage = async (artist: ArtistTagRecord, targetPage: number) => {
    if (previewLoading[artist.id]) return;
    setPreviewPendingPage((current) => ({ ...current, [artist.id]: targetPage }));
    await loadPreviewPage(artist, targetPage);
    setPreviewPageByArtist((current) => ({ ...current, [artist.id]: targetPage }));
    setPreviewPendingPage((current) => ({ ...current, [artist.id]: undefined }));
  };

  const changeRankingPage = async (targetPage: number) => {
    const nextPage = Math.max(1, Math.min(pageCount, targetPage));
    if (nextPage === page || pendingRankingPage !== null) return;
    setPendingRankingPage(nextPage);
    await load(false, nextPage, pageSize, query);
    setPendingRankingPage(null);
    window.requestAnimationFrame(() => scrollGalleryPageToTop(pageRef.current));
  };

  const togglePreview = async (artist: ArtistTagRecord) => {
    if (expanded === artist.id) {
      setExpanded(null);
      return;
    }
    setExpanded(artist.id);
    setPreviewPageByArtist((current) => ({ ...current, [artist.id]: current[artist.id] ?? 1 }));
    await loadPreviewPage(artist, previewPageByArtist[artist.id] ?? 1);
  };

  return (
    <main ref={pageRef} className="aitag-page artist-ranking-page">
      <header className="aitag-header online-gallery-header">
        <div>
          {onBack ? <button type="button" className="btn secondary compact" onClick={onBack}>{text.back}</button> : null}
          <div className="online-gallery-title-line"><h2>{text.artistTitle}</h2><GallerySourcePicker value="artist-ranking" onChange={onSourceChange} text={text} /></div>
          <p>{text.artistSubtitle}</p>
        </div>
        <div className="aitag-header-actions">
          <span className="artist-ranking-updated">{text.updated}: {updatedAt ? new Date(updatedAt).toLocaleString() : text.neverUpdated}</span>
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void load(true, page, pageSize, query)}>{text.manualUpdate}</button>
          <button type="button" className="btn secondary" onClick={() => void window.naiDesktop.openExternal("https://danbooru.donmai.us/artists")}>{text.openDanbooru}</button>
        </div>
      </header>
      <section className="artist-ranking-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.artistSearch} />
        <SelectMenu className="gallery-page-size-picker" value={String(pageSize)} ariaLabel={text.itemsPerPage} label={text.itemsPerPage} options={GALLERY_PAGE_SIZE_OPTIONS.map((item) => ({ value: String(item), label: formatText(text.artistPageSize, { count: item }) }))} onChange={(next) => { const size = Number(next); setPageSize(size); void load(false, 1, size, query); }} />
        <span>{formatText(text.artistCount, { count: artistTotal.toLocaleString() })}</span>
      </section>
      {loading && artists.length === 0 ? <div className="aitag-state">{text.loadingArtists}</div> : null}
      {error ? <div className="aitag-state error"><span>{error}</span><button type="button" className="btn secondary" onClick={() => void load(false, page, pageSize, query)}>{text.retry}</button></div> : null}
      {!error && artists.length > 0 ? (
        <section className="artist-ranking-list">
          {rows.map((artist) => {
            const rank = ranks.get(artist.id) ?? 0;
            const preview = previews[artist.id];
            const previewResolved = Object.prototype.hasOwnProperty.call(previews, artist.id);
            const previewPage = previewPageByArtist[artist.id] ?? 1;
            const pendingPreviewPage = previewPendingPage[artist.id];
            const previewResult = previewPages[`${artist.id}:${previewPage}`];
            const previewPageCount = Math.max(1, Math.ceil((previewResult?.total ?? 0) / ARTIST_PREVIEW_PAGE_SIZE));
            return <article key={artist.id} className={expanded === artist.id ? "is-expanded" : ""}>
              <button type="button" className="artist-ranking-main" onClick={() => void togglePreview(artist)}>
                <b>#{rank}</b>
                <span className="artist-ranking-thumb" aria-hidden="true">
                  {preview ? <img src={preview.imageUrl} alt="" loading="lazy" /> : <i>{previewResolved ? text.noPreviews : "…"}</i>}
                </span>
                <span className="artist-ranking-copy"><strong>{artist.name.replaceAll("_", " ")}</strong><code>artist:{artist.name}</code></span>
                <em>{artist.postCount.toLocaleString()} {text.works}</em>
              </button>
              <div className="artist-ranking-actions">
                <button type="button" title={text.copyArtistTag} onClick={() => void navigator.clipboard.writeText(`artist:${artist.name}`)}>{text.copyTag}</button>
                <button type="button" title={text.openArtistLibrary} onClick={() => void window.naiDesktop.openExternal(`https://danbooru.donmai.us/posts?tags=${encodeURIComponent(artist.name)}`)}>{text.library}</button>
              </div>
              {expanded === artist.id ? <div className="artist-ranking-preview">
                {previewLoading[artist.id] && !previewResult ? <span className="artist-ranking-preview-state"><span className="spinner" />{text.loadingPreviews}</span> : null}
                {!previewLoading[artist.id] && previewResult?.items.length === 0 ? <span className="artist-ranking-preview-state">{text.noPreviews}</span> : null}
                {previewResult?.items.length ? <>
                  <div className="artist-ranking-preview-grid">
                    {previewResult.items.map((item, index) => (
                      <button
                        key={item.postUrl}
                        type="button"
                        aria-label={formatText(text.artistPreviewLabel, { artist: artist.name, index: index + 1 })}
                        title={text.previewHint}
                        style={item.width > 0 && item.height > 0 ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
                        onDoubleClick={() => setPreviewLightbox({ artist: artist.name, items: previewResult.items, index })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setPreviewLightbox({ artist: artist.name, items: previewResult.items, index });
                          }
                        }}
                      >
                        <img src={item.imageUrl} alt={formatText(text.artistPreviewLabel, { artist: artist.name, index: index + 1 })} loading="lazy" />
                      </button>
                    ))}
                  </div>
                  <nav className="artist-ranking-preview-pagination" aria-label={`${artist.name} · ${text.rankingPagination}`}>
                    <button type="button" disabled={previewPage <= 1 || previewLoading[artist.id]} onClick={() => void changePreviewPage(artist, previewPage - 1)}>{text.previous}</button>
                    <GalleryPageNumberInput page={pendingPreviewPage ?? previewPage} pageCount={previewPageCount} disabled={Boolean(previewLoading[artist.id])} text={text} onChange={(next) => void changePreviewPage(artist, next)} />
                    <b aria-live="polite">{pendingPreviewPage ? formatText(text.loadingPage, { page: pendingPreviewPage }) : formatText(text.previewPage, { page: previewPage, pages: previewPageCount })}</b>
                    <button type="button" disabled={!previewResult.hasMore || previewLoading[artist.id]} onClick={() => void changePreviewPage(artist, previewPage + 1)}>{text.next}</button>
                  </nav>
                </> : null}
              </div> : null}
            </article>;
          })}
          <nav className="aitag-pagination artist-ranking-pagination" aria-label={text.rankingPagination}>
            <button type="button" className="btn secondary" disabled={page <= 1 || pendingRankingPage !== null} onClick={() => void changeRankingPage(page - 1)}>{text.previous}</button>
            <GalleryPageNumberInput page={pendingRankingPage ?? page} pageCount={pageCount} disabled={pendingRankingPage !== null} text={text} onChange={(next) => void changeRankingPage(next)} />
            <b aria-live="polite">{pendingRankingPage ? formatText(text.loadingPage, { page: pendingRankingPage }) : formatText(text.rankingPage, { page, pages: pageCount, start: artistTotal > 0 ? (page - 1) * pageSize + 1 : 0, end: Math.min(page * pageSize, artistTotal), total: artistTotal })}</b>
            <button type="button" className="btn secondary" disabled={page >= pageCount || pendingRankingPage !== null} onClick={() => void changeRankingPage(page + 1)}>{text.next}</button>
          </nav>
        </section>
      ) : null}
      {previewLightbox ? <AppPortal>
        <div className="modal-backdrop artist-ranking-lightbox-backdrop" onClick={() => setPreviewLightbox(null)}>
          <section className="artist-ranking-lightbox" role="dialog" aria-modal="true" aria-label={formatText(text.artistLightbox, { artist: previewLightbox.artist })} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="artist-ranking-lightbox-close" aria-label={text.closePreview} onClick={() => setPreviewLightbox(null)}>×</button>
            <img src={previewLightbox.items[previewLightbox.index].imageUrl} alt={formatText(text.artistLightbox, { artist: previewLightbox.artist })} />
            <footer>
              <button type="button" disabled={previewLightbox.index <= 0} onClick={() => setPreviewLightbox((current) => current ? { ...current, index: Math.max(0, current.index - 1) } : current)}>{text.previousImage}</button>
              <span>{previewLightbox.index + 1} / {previewLightbox.items.length} · {previewLightbox.items[previewLightbox.index].width}×{previewLightbox.items[previewLightbox.index].height}</span>
              <button type="button" onClick={() => void window.naiDesktop.openExternal(previewLightbox.items[previewLightbox.index].postUrl || previewLightbox.items[previewLightbox.index].sourceUrl)}>{text.openSourcePage}</button>
              <button type="button" disabled={previewLightbox.index >= previewLightbox.items.length - 1} onClick={() => setPreviewLightbox((current) => current ? { ...current, index: Math.min(current.items.length - 1, current.index + 1) } : current)}>{text.nextImage}</button>
            </footer>
          </section>
        </div>
      </AppPortal> : null}
    </main>
  );
}

function OnlineCachedImage({
  source,
  text,
  src,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { source: OnlineGallerySourceId; src: string; text: GalleryText }) {
  const [resolved, setResolved] = useState("");
  const [failed, setFailed] = useState(false);
  const retryRef = useRef(false);
  const activeRef = useRef(true);
  const resolve = useCallback((force: boolean) => {
    const days = Number(localStorage.getItem(AITAG_CACHE_RETENTION_KEY) ?? "30");
    return window.naiDesktop.onlineGalleryCacheImage(source, src, Number.isFinite(days) ? days : 30, force)
      .then((localUrl) => {
        if (!activeRef.current) return;
        setResolved(localUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!activeRef.current) return;
        setResolved("");
        setFailed(true);
      });
  }, [source, src]);
  useEffect(() => {
    activeRef.current = true;
    retryRef.current = false;
    setResolved("");
    setFailed(false);
    void resolve(false);
    return () => { activeRef.current = false; };
  }, [resolve]);
  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    onError?.(event);
    if (retryRef.current) {
      setResolved("");
      setFailed(true);
      return;
    }
    retryRef.current = true;
    setResolved("");
    void resolve(true);
  };
  return resolved && !failed
    ? <img {...props} src={resolved} onError={handleError} />
    : <span className="aitag-image-loading">{failed ? text.unavailableImage : text.imageLoading}</span>;
}

function ExternalWorkCard({ item, onOpen, text }: { item: OnlineGalleryItem; onOpen: (item: OnlineGalleryItem) => void; text: GalleryText }) {
  return (
    <article className="aitag-card online-gallery-card">
      <button type="button" className="aitag-card-hit" aria-label={item.title} onClick={() => onOpen(item)}>
        <div className="aitag-card-image" style={item.cover.width > 0 && item.cover.height > 0 ? { aspectRatio: `${item.cover.width} / ${item.cover.height}` } : undefined}>
          {item.cover.previewUrl
            ? <OnlineCachedImage source={item.source} text={text} src={item.cover.previewUrl} alt="" />
            : <span>{item.kind === "collection" ? text.codex : onlineGallerySourceInfo(item.source).label}</span>}
          <small>{item.kind === "collection" ? formatText(text.imageCount, { count: item.mediaCount }) : item.rating.toUpperCase()}</small>
        </div>
        <div className="aitag-card-copy">
          <b>{item.title || `#${item.id}`}</b>
          <span>{item.author || onlineGallerySourceInfo(item.source).label} · {item.createdAt || "—"}</span>
          <p>{item.description || item.prompt.slice(0, 160)}</p>
          <div>
            <small>{item.kind === "collection" ? text.openCollection : formatText(text.score, { count: item.score })}</small>
            <small>{item.favoriteCount ? formatText(text.bookmarks, { count: item.favoriteCount }) : formatText(text.images, { count: item.mediaCount })}</small>
          </div>
        </div>
      </button>
    </article>
  );
}

const EMPTY_EXTERNAL_PAGE: OnlineGalleryPage = {
  source: "safebooru",
  page: 1,
  pageSize: DEFAULT_GALLERY_PAGE_SIZE,
  hasMore: false,
  items: [],
};

function ExternalGallery({
  source,
  onSourceChange,
  onBack,
  text,
}: {
  source: Exclude<OnlineGallerySourceId, "aitag" | "artist-ranking">;
  onSourceChange: (source: OnlineGallerySourceId) => void;
  onBack?: () => void;
  text: GalleryText;
}) {
  const pageRef = useRef<HTMLElement>(null);
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [queryValue, setQueryValue] = useState("");
  const [safeOnly, setSafeOnly] = useState(true);
  const [collectionId, setCollectionId] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [result, setResult] = useState<OnlineGalleryPage>({ ...EMPTY_EXTERNAL_PAGE, source });
  const [pageSize, setPageSize] = useState(loadGalleryPageSize);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<OnlineGalleryDetail | null>(null);
  const [selectedMedia, setSelectedMedia] = useState(0);
  const gelbooruApiKey = DEFAULT_GELBOORU_API_KEY;
  const gelbooruUserId = DEFAULT_GELBOORU_USER_ID;
  const requestSequence = useRef(0);
  const info = { ...onlineGallerySourceInfo(source), label: localizedGallerySourceLabel(source, text) };

  const search = useCallback(async (
    targetPage = 1,
    targetCollection = collectionId,
    targetQuery = queryValue,
    targetSafeOnly = safeOnly,
    targetPageSize = pageSize,
  ) => {
    const sequence = ++requestSequence.current;
    const keepCurrentPage = result.items.length > 0;
    const scrollAfterSwap = keepCurrentPage && targetPage !== result.page;
    setPendingPage(keepCurrentPage ? targetPage : null);
    setLoading(true);
    setError("");
    try {
      const pageResult = await window.naiDesktop.onlineGallerySearch({
        source,
        page: targetPage,
        pageSize: targetPageSize,
        query: targetQuery,
        collectionId: targetCollection || undefined,
        safeOnly: targetSafeOnly,
        gelbooruApiKey,
        gelbooruUserId,
      });
      if (sequence !== requestSequence.current) return;
      if (keepCurrentPage) {
        const days = Number(localStorage.getItem(AITAG_CACHE_RETENTION_KEY) ?? "30");
        await Promise.allSettled(pageResult.items.map((item) => item.cover.previewUrl
          ? window.naiDesktop.onlineGalleryCacheImage(source, item.cover.previewUrl, Number.isFinite(days) ? days : 30, false)
          : Promise.resolve("")));
      }
      if (sequence !== requestSequence.current) return;
      setResult(pageResult);
      setCollectionTitle(pageResult.collectionTitle ?? "");
      if (scrollAfterSwap) window.requestAnimationFrame(() => scrollGalleryPageToTop(pageRef.current));
    } catch (reason) {
      if (sequence !== requestSequence.current) return;
      const message = String(reason ?? "");
      setError(source === "gelbooru" && /401|403|unauthorized|credentials|GELBOORU/i.test(message)
        ? text.invalidCredentials
        : text.sourceFailed);
    } finally {
      if (sequence === requestSequence.current) {
        setPendingPage(null);
        setLoading(false);
      }
    }
  }, [collectionId, gelbooruApiKey, gelbooruUserId, pageSize, queryValue, result.items.length, result.page, safeOnly, source, text.invalidCredentials, text.sourceFailed]);

  useEffect(() => { globalThis.localStorage?.setItem(GALLERY_PAGE_SIZE_KEY, String(pageSize)); }, [pageSize]);

  useEffect(() => {
    setSelected(null);
    setCollectionId("");
    setCollectionTitle("");
    setQueryValue("");
    setResult({ ...EMPTY_EXTERNAL_PAGE, source });
  }, [source]);

  useEffect(() => {
    void search(1, "", "", true);
  }, [source]); // source switch only; searches after that are explicit

  const refresh = async () => {
    await window.naiDesktop.onlineGalleryClearDataCache();
    await search(result.page);
  };

  const openItem = async (item: OnlineGalleryItem) => {
    if (item.kind === "collection") {
      setCollectionId(item.id);
      setCollectionTitle(item.title);
      setQueryValue("");
      await search(1, item.id, "");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const detail = await window.naiDesktop.onlineGalleryDetail({
        source,
        id: item.id,
        collectionId: item.collectionId,
        gelbooruApiKey,
        gelbooruUserId,
      });
      setSelected(detail);
      setSelectedMedia(0);
    } catch {
      setError(text.detailFailed);
    } finally {
      setLoading(false);
    }
  };

  if (selected) {
    const media = selected.media[selectedMedia] ?? selected.item.cover;
    const tagGroups = [
      [text.tagArtists, selected.item.tags.artists],
      [text.tagCharacters, selected.item.tags.characters],
      [text.tagCopyrights, selected.item.tags.copyrights],
      [text.tagGeneral, selected.item.tags.general],
      [text.tagMetadata, selected.item.tags.meta],
    ] as const;
    return (
      <main className="aitag-page aitag-detail-page">
        <header className="aitag-header">
          <div>
            <button type="button" className="btn secondary compact" onClick={() => setSelected(null)}>{text.detailBack}</button>
            <h2>{selected.item.title || `#${selected.item.id}`}</h2>
            <p>{info.label} · {selected.item.createdAt || "—"}</p>
          </div>
          <button type="button" className="btn secondary" disabled={!selected.item.sourceUrl} onClick={() => void window.naiDesktop.openExternal(selected.item.sourceUrl)}>{text.openSourcePage}</button>
        </header>
        <section className="aitag-work-facts">
          <article><span>{text.gallerySource}</span><b>{info.label}</b></article>
          <article><span>{text.author}</span><b>{selected.item.author || "—"}</b></article>
          <article><span>{text.rating}</span><b>{selected.item.rating || "—"}</b></article>
          <article><span>{text.size}</span><b>{media.width && media.height ? `${media.width} × ${media.height}` : "—"}</b></article>
        </section>
        <section className="aitag-detail-grid">
          <div className="aitag-detail-visual">
            {media.displayUrl ? <OnlineCachedImage source={source} text={text} src={media.displayUrl} alt={selected.item.title} /> : null}
            {selected.media.length > 1 ? (
              <div className="aitag-image-strip">
                {selected.media.map((candidate, index) => (
                  <button key={candidate.id} type="button" className={index === selectedMedia ? "active" : ""} style={candidate.width > 0 && candidate.height > 0 ? { aspectRatio: `${candidate.width} / ${candidate.height}` } : undefined} onClick={() => setSelectedMedia(index)}>
                    <OnlineCachedImage source={source} text={text} src={candidate.previewUrl} alt={`${selected.item.title} ${index + 1}`} />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="aitag-metadata-panel online-gallery-detail-info">
            {selected.prompt ? (
              <article className="aitag-data-block">
                <header>
                  <h3>{text.promptText}</h3>
                  <div className="online-gallery-inline-actions">
                    <CopyButton value={selected.prompt} text={text} />
                    <button type="button" className="btn primary compact" onClick={() => { applyParams({ positivePrompt: selected.prompt, ...(selected.negativePrompt ? { negativePrompt: selected.negativePrompt } : {}) }); setActiveTab("generate"); }}>{text.use}</button>
                  </div>
                </header>
                <pre>{selected.prompt}</pre>
              </article>
            ) : null}
            {selected.negativePrompt ? (
              <article className="aitag-data-block">
                <header><h3>{text.negativePrompt}</h3><CopyButton value={selected.negativePrompt} text={text} /></header>
                <pre>{selected.negativePrompt}</pre>
              </article>
            ) : null}
            {tagGroups.map(([label, tags]) => tags.length ? (
              <section key={label} className="online-gallery-tag-section">
                <h3>{label} ({tags.length})</h3>
                <div>{tags.map((tag) => <button key={tag} type="button" onClick={() => { setSelected(null); setQueryValue(tag); void search(1, collectionId, tag); }}>{tag.replaceAll("_", " ")}</button>)}</div>
              </section>
            ) : null)}
            {selected.note ? <article className="aitag-data-block"><header><h3>{text.note}</h3></header><p>{selected.note}</p></article> : null}
          </div>
        </section>
      </main>
    );
  }

  const maxPage = result.total ? Math.max(1, Math.ceil(result.total / result.pageSize)) : undefined;
  return (
    <main ref={pageRef} className="aitag-page">
      <header className="aitag-header online-gallery-header">
        <div>
          {onBack ? <button type="button" className="btn secondary compact" onClick={onBack}>{text.back}</button> : null}
          <div className="online-gallery-title-line">
            <h2>{collectionTitle || text.title}</h2>
            <GallerySourcePicker value={source} onChange={onSourceChange} text={text} />
          </div>
          <p>{collectionId ? `${info.label} · ${collectionTitle}` : formatText(text.sourceDescription, { source: info.label })}</p>
        </div>
        <div className="aitag-header-actions">
          {collectionId ? <button type="button" className="btn secondary" onClick={() => { setCollectionId(""); setCollectionTitle(""); setQueryValue(""); void search(1, "", ""); }}>{text.backCollections}</button> : null}
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void refresh()}>{text.refresh}</button>
          <button type="button" className="btn secondary" onClick={() => void window.naiDesktop.openExternal(info.siteUrl)}>{text.openSourceSite}</button>
        </div>
      </header>
      <section className="aitag-search-panel">
        <div className="online-gallery-search-row">
          <input value={queryValue} onChange={(event) => setQueryValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(1); }} placeholder={source === "quicktag" ? text.searchCollections : text.searchTags} />
          <button type="button" className="btn primary" disabled={loading} onClick={() => void search(1)}>{text.search}</button>
        </div>
        <div className="aitag-sort-tabs online-gallery-filter-row">
          <label className="online-gallery-safe-toggle"><input type="checkbox" checked={safeOnly} onChange={(event) => { const checked = event.target.checked; setSafeOnly(checked); void search(1, collectionId, queryValue, checked); }} /><span>{text.safeOnly}</span></label>
          <SelectMenu className="gallery-page-size-picker" value={String(pageSize)} ariaLabel={text.itemsPerPage} label={text.itemsPerPage} options={GALLERY_PAGE_SIZE_OPTIONS.map((item) => ({ value: String(item), label: String(item) }))} onChange={(next) => { const size = Number(next); setPageSize(size); void search(1, collectionId, queryValue, safeOnly, size); }} />
          <span>{formatText(result.total == null ? text.resultCount : text.resultTotal, { count: result.total ?? result.items.length })}</span>
        </div>
      </section>
      {loading && result.items.length === 0 ? <div className="aitag-state">{formatText(text.loadingSource, { source: info.label })}</div> : null}
      {error ? <div className="aitag-state error"><span>{error}</span><button type="button" className="btn secondary" onClick={() => void search(result.page)}>{text.retry}</button></div> : null}
      {!loading && !error && result.items.length === 0 ? <div className="aitag-state">{text.empty}</div> : null}
      {!error && result.items.length > 0 ? (
        <section className="aitag-work-grid online-gallery-work-grid">
          {result.items.map((item) => <ExternalWorkCard key={`${item.source}:${item.id}`} item={item} text={text} onOpen={(value) => void openItem(value)} />)}
        </section>
      ) : null}
      {!error && result.items.length > 0 ? (
        <nav className="aitag-pagination" aria-label={text.page}>
          <button type="button" className="btn secondary" disabled={result.page <= 1 || pendingPage !== null} onClick={() => void search(result.page - 1)}>{text.previous}</button>
          <GalleryPageNumberInput page={pendingPage ?? result.page} pageCount={maxPage || undefined} disabled={pendingPage !== null} text={text} onChange={(next) => void search(next)} />
          <b aria-live="polite">{pendingPage ? formatText(text.loadingPage, { page: pendingPage }) : maxPage ? formatText(text.pagePosition, { page: result.page, pages: maxPage }) : interpolate(text.page, "page", result.page)}</b>
          <button type="button" className="btn secondary" disabled={pendingPage !== null || (maxPage ? result.page >= maxPage : !result.hasMore)} onClick={() => void search(result.page + 1)}>{text.next}</button>
        </nav>
      ) : null}
    </main>
  );
}

function AitagCachedImage({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [resolved, setResolved] = useState("");
  const [failed, setFailed] = useState(false);
  const retryRef = useRef(false);
  const activeRef = useRef(true);
  const resolve = useCallback((force: boolean) => {
    const days = Number(localStorage.getItem(AITAG_CACHE_RETENTION_KEY) ?? "30");
    return window.naiDesktop.aitagCacheImage(src, Number.isFinite(days) ? days : 30, force)
      .then((localUrl) => {
        if (!activeRef.current) return;
        setResolved(localUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!activeRef.current) return;
        setResolved("");
        setFailed(true);
      });
  }, [src]);
  useEffect(() => {
    activeRef.current = true;
    retryRef.current = false;
    setResolved("");
    setFailed(false);
    void resolve(false);
    return () => { activeRef.current = false; };
  }, [resolve]);
  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    onError?.(event);
    if (retryRef.current) {
      setResolved("");
      setFailed(true);
      return;
    }
    retryRef.current = true;
    setResolved("");
    void resolve(true);
  };
  return resolved && !failed
    ? <img {...props} src={resolved} onError={handleError} />
    : <span className="aitag-image-loading">{failed ? "—" : "AITag"}</span>;
}

function WorkCard({
  work,
  config,
  text,
  loadDetail,
  onOpen,
}: {
  work: AitagWorkSummary;
  config: AitagConfig;
  text: GalleryText;
  loadDetail: (id: number) => Promise<AitagWorkDetail>;
  onOpen: (work: AitagWorkSummary) => void;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadDetail(work.id).then((detail) => {
        const first = detail.images[0];
        if (first) setImageUrl(aitagImageUrl(config, first));
      }).catch(() => undefined);
    }, { rootMargin: "320px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [config, loadDetail, work.id]);

  return (
    <article ref={rootRef} className="aitag-card" onClick={() => onOpen(work)}>
      <button type="button" className="aitag-card-hit" aria-label={work.title || `#${work.id}`}>
        <div className="aitag-card-image" style={aspectRatio ? { aspectRatio } : undefined}>
          {imageUrl ? <AitagCachedImage src={imageUrl} alt="" onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth > 0 && image.naturalHeight > 0) setAspectRatio(image.naturalWidth / image.naturalHeight);
          }} /> : <span>AITag</span>}
          <small>{interpolate(text.images, "count", work.imageCount)}</small>
        </div>
        <div className="aitag-card-copy">
          <b>{work.title || `#${work.id}`}</b>
          <span>{work.aiType || "AI"} · {work.createDate || "—"}</span>
          <p>{stripAitagHtml(work.caption) || work.tags.slice(0, 5).join(" · ")}</p>
          <div>
            <small>{interpolate(text.views, "count", work.totalView)}</small>
            <small>{interpolate(text.bookmarks, "count", work.totalBookmarks)}</small>
          </div>
        </div>
      </button>
    </article>
  );
}

export default function AitagGallery({ onBack }: { onBack?: () => void }) {
  const pageRef = useRef<HTMLElement>(null);
  const language = normalizeAppLanguage(useAppStore((state) => state.settings?.language));
  const settings = useAppStore((state) => state.settings);
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const text = TEXT[language];
  const [gallerySource, setGallerySourceState] = useState<OnlineGallerySourceId>(loadGallerySource);
  const [config, setConfig] = useState<AitagConfig>(() => gallerySession.config);
  const [query, setQuery] = useState(gallerySession.query);
  const [prompt, setPrompt] = useState(gallerySession.prompt);
  const [sort, setSort] = useState<AitagSort>(gallerySession.sort);
  const [timeRange, setTimeRange] = useState(gallerySession.timeRange);
  const [page, setPage] = useState(gallerySession.page);
  const [pageSize, setPageSize] = useState(loadGalleryPageSize);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [result, setResult] = useState(() => gallerySession.result);
  const [loading, setLoading] = useState(!gallerySession.loaded);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<AitagWorkDetail | null>(gallerySession.selected);
  const [selectedImage, setSelectedImage] = useState(gallerySession.selectedImage);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compatibleSelection, setCompatibleSelection] = useState<Set<keyof ImportedParams>>(loadCompatibleSelection);
  const searchSequence = useRef(0);

  const setGallerySource = useCallback((source: OnlineGallerySourceId) => {
    localStorage.setItem(ONLINE_GALLERY_SOURCE_KEY, source);
    setGallerySourceState(source);
  }, []);

  useEffect(() => {
    localStorage.setItem(COMPATIBLE_SELECTION_KEY, JSON.stringify([...compatibleSelection]));
  }, [compatibleSelection]);
  useEffect(() => { globalThis.localStorage?.setItem(GALLERY_PAGE_SIZE_KEY, String(pageSize)); }, [pageSize]);

  useEffect(() => {
    Object.assign(gallerySession, { config, query, prompt, sort, timeRange, page, result, selected, selectedImage });
  }, [config, page, prompt, query, result, selected, selectedImage, sort, timeRange]);

  const loadDetail = useCallback((id: number) => {
    const existing = galleryDetailCache.get(id);
    if (existing) return existing;
    const request = window.naiDesktop.aitagWork(id).then(normalizeAitagDetail);
    galleryDetailCache.set(id, request);
    request.catch(() => galleryDetailCache.delete(id));
    return request;
  }, []);

  const search = useCallback(async (
    targetPage = 1,
    overrides?: { sort?: AitagSort; timeRange?: string; pageSize?: number },
  ) => {
    const sequence = ++searchSequence.current;
    const targetPageSize = overrides?.pageSize ?? pageSize;
    const keepCurrentPage = result.items.length > 0;
    const scrollAfterSwap = keepCurrentPage && targetPage !== page;
    setPendingPage(keepCurrentPage ? targetPage : null);
    setLoading(true);
    setError(false);
    try {
      const raw = await window.naiDesktop.aitagSearch({
        page: targetPage,
        pageSize: targetPageSize,
        query,
        prompt,
        sort: overrides?.sort ?? sort,
        timeRange: overrides?.timeRange ?? timeRange,
      });
      const normalized = normalizeAitagSearch(raw);
      if (sequence !== searchSequence.current) return;
      if (keepCurrentPage) {
        const days = Number(localStorage.getItem(AITAG_CACHE_RETENTION_KEY) ?? "30");
        await Promise.allSettled(normalized.items.map(async (work) => {
          const detail = await loadDetail(work.id);
          const first = detail.images[0];
          if (!first) return "";
          return window.naiDesktop.aitagCacheImage(aitagImageUrl(config, first), Number.isFinite(days) ? days : 30, false);
        }));
      }
      if (sequence !== searchSequence.current) return;
      setResult(normalized);
      setPage(normalized.page);
      gallerySession.result = normalized;
      gallerySession.page = normalized.page;
      gallerySession.loaded = true;
      if (scrollAfterSwap) window.requestAnimationFrame(() => scrollGalleryPageToTop(pageRef.current));
    } catch {
      if (sequence === searchSequence.current) setError(true);
    } finally {
      if (sequence === searchSequence.current) {
        setPendingPage(null);
        setLoading(false);
      }
    }
  }, [config, loadDetail, page, pageSize, prompt, query, result.items.length, sort, timeRange]);

  useEffect(() => {
    if (gallerySession.loaded) return;
    let active = true;
    void (async () => {
      const snapshot = await window.naiDesktop.aitagSnapshot().catch(() => null);
      if (active && snapshot) {
        const nextConfig = normalizeAitagConfig(snapshot.config);
        const nextResult = normalizeAitagSearch(snapshot.search);
        setConfig(nextConfig);
        setResult(nextResult);
        setPage(nextResult.page);
        setLoading(false);
        gallerySession.config = nextConfig;
        gallerySession.result = nextResult;
        gallerySession.page = nextResult.page;
        gallerySession.loaded = true;
      }
      try {
        const [rawConfig, rawResult] = await Promise.all([
          window.naiDesktop.aitagConfig(),
          window.naiDesktop.aitagSearchFresh({ page: 1, pageSize, query: "", prompt: "", sort: "new", timeRange: "all" }),
        ]);
        if (!active) return;
        const nextConfig = normalizeAitagConfig(rawConfig);
        const nextResult = normalizeAitagSearch(rawResult);
        setConfig(nextConfig);
        setResult(nextResult);
        setPage(nextResult.page);
        setError(false);
        gallerySession.config = nextConfig;
        gallerySession.result = nextResult;
        gallerySession.page = nextResult.page;
        gallerySession.loaded = true;
      } catch {
        if (active && !snapshot) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []); // initial load only; later searches are explicit

  const refresh = useCallback(async () => {
    galleryDetailCache.clear();
    gallerySession.loaded = false;
    await window.naiDesktop.aitagClearDataCache();
    setSelected(null);
    setSelectedImage(0);
    try {
      const raw = await window.naiDesktop.aitagConfig();
      setConfig(normalizeAitagConfig(raw));
    } catch {
      // Searching still works with the last known CDN/config values.
    }
    await search(page);
  }, [page, search]);

  const openWork = async (work: AitagWorkSummary) => {
    setDetailLoading(true);
    setError(false);
    try {
      const detail = await loadDetail(work.id);
      setSelected(detail);
      setSelectedImage(0);
    } catch {
      setError(true);
    } finally {
      setDetailLoading(false);
    }
  };

  const image = selected?.images[selectedImage];
  const imageUrl = selected && image ? aitagImageUrl(config, image) : "";
  const metadata = image ? formatAitagMetadata(image.aiJson) : "";
  const report = useMemo(
    () => image ? inspectImageMetadata(aitagMetadataRecord(image, selected?.work.aiType ?? "")) : null,
    [image, selected?.work.aiType],
  );
  const compatibleEntries = useMemo(
    () => report
      ? (Object.entries(report.imported) as [keyof ImportedParams, ImportedParams[keyof ImportedParams]][])
          .filter(([, value]) => value !== undefined)
      : [],
    [report],
  );
  const selectedCompatibleEntries = compatibleEntries.filter(([key]) => compatibleSelection.has(key));
  const compatibleCount = compatibleEntries.length;

  const applyCompatible = () => {
    if (!report || !selectedCompatibleEntries.length) return;
    const patch = Object.fromEntries(selectedCompatibleEntries) as Partial<ImportedParams>;
    if (settings?.lockNegativePrompt) delete patch.negativePrompt;
    applyParams(patch);
    setActiveTab("generate");
  };

  const toggleCompatible = (key: keyof ImportedParams) => {
    setCompatibleSelection((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const maxPage = Math.max(1, Math.ceil(result.total / (result.pageSize || pageSize || AITAG_PAGE_SIZE)));
  const timeOptions = useMemo(() => {
    if (sort === "monthly") {
      const months = [...new Set(config.availableMonths)]
        .filter((month) => month >= "2023-11")
        .sort((a, b) => b.localeCompare(a));
      return [
        { value: "current", label: text.currentMonth },
        ...months.map((month) => ({ value: `m${month}`, label: month })),
        { value: "older", label: text.older },
      ];
    }
    const years = config.availableYears.length ? [...config.availableYears].sort((a, b) => b - a) : [new Date().getFullYear()];
    return [
      { value: "all", label: text.allTime },
      ...years.flatMap((year) => [
        { value: `y${year}`, label: interpolate(text.fullYear, "year", year) },
        ...(year > 2023 ? [1, 2, 3, 4] as const : year === 2023 ? [4] as const : []).map((quarter) => ({
          value: `q${year}Q${quarter}`,
          label: interpolate(interpolate(text.quarter, "year", year), "quarter", quarter),
        })),
      ]),
      { value: "older", label: text.older },
    ];
  }, [config.availableMonths, config.availableYears, sort, text]);

  if (gallerySource === "artist-ranking") {
    return <ArtistRankingGallery onSourceChange={setGallerySource} onBack={onBack} text={text} />;
  }

  if (gallerySource !== "aitag") {
    return (
      <ExternalGallery
        source={gallerySource}
        onSourceChange={setGallerySource}
        onBack={onBack}
        text={text}
      />
    );
  }

  if (selected) {
    return (
      <main className="aitag-page aitag-detail-page">
        <header className="aitag-header">
          <div>
            <button type="button" className="btn secondary compact" onClick={() => setSelected(null)}>{text.detailBack}</button>
            <div className="online-gallery-title-line">
              <h2>{selected.work.title || `#${selected.work.id}`}</h2>
              <GallerySourcePicker value={gallerySource} onChange={setGallerySource} text={text} />
            </div>
            <p>{text.sourceNotice}</p>
          </div>
          <button type="button" className="btn secondary" onClick={() => void window.naiDesktop.openExternal(`${AITAG_SITE_URL}/i/${selected.work.id}`)}>{text.source}</button>
        </header>

        <section className="aitag-work-facts">
          <article><span>{text.workId}</span><b>{selected.work.id}</b></article>
          <article><span>{text.author}</span><b>{selected.work.userId || "—"}</b></article>
          <article><span>{text.created}</span><b>{selected.work.createDate || "—"}</b></article>
          <article><span>{text.aiType}</span><b>{selected.work.aiType || "—"}</b></article>
        </section>

        <section className="aitag-detail-grid">
          <div className="aitag-detail-visual">
            {imageUrl ? <AitagCachedImage src={imageUrl} alt={interpolate(text.image, "index", selectedImage + 1)} /> : null}
            <div className="aitag-image-strip">
              {selected.images.map((candidate, index) => (
                <button key={candidate.id || index} type="button" className={index === selectedImage ? "active" : ""} onClick={() => setSelectedImage(index)}>
                  <AitagCachedImage src={aitagImageUrl(config, candidate)} alt={interpolate(text.image, "index", index + 1)} loading="lazy" onLoad={(event) => {
                    const image = event.currentTarget;
                    if (image.naturalWidth > 0 && image.naturalHeight > 0 && image.parentElement) image.parentElement.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
                  }} />
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="aitag-metadata-panel">
            <div className="aitag-metadata-title">
              <div><span>{text.model}</span><b>{image?.model || selected.work.aiType || "—"}</b></div>
              <div className="aitag-compatible-action">
                <span>{interpolate(interpolate(text.selectedCompatible, "selected", selectedCompatibleEntries.length), "total", compatibleCount)}</span>
                <button type="button" className="btn primary compact" title={!selectedCompatibleEntries.length ? text.noSelected : undefined} disabled={!selectedCompatibleEntries.length} onClick={applyCompatible}>{text.use}</button>
              </div>
            </div>
            {compatibleEntries.length ? (
              <details className="aitag-compatible-details">
                <summary>
                  <span>{text.compatibleSettings}</span>
                  <small>{interpolate(interpolate(text.selectedCompatible, "selected", selectedCompatibleEntries.length), "total", compatibleCount)}</small>
                </summary>
                <div className="aitag-compatible-toolbar">
                  <button type="button" className="btn secondary compact" onClick={() => setCompatibleSelection(new Set(COMPATIBLE_PARAM_KEYS))}>{text.selectAll}</button>
                  <button type="button" className="btn secondary compact" onClick={() => setCompatibleSelection(new Set())}>{text.clearAll}</button>
                </div>
                <div className="aitag-compatible-options">
                  {compatibleEntries.map(([key, value]) => (
                    <label key={key}>
                      <input type="checkbox" checked={compatibleSelection.has(key)} onChange={() => toggleCompatible(key)} />
                      <span><strong>{parameterLabel(language, IMPORT_LABELS[key])}</strong><small>{String(value)}</small></span>
                    </label>
                  ))}
                </div>
              </details>
            ) : null}
            {image?.promptText ? (
              <article className="aitag-data-block">
                <header><h3>{text.promptText}</h3><CopyButton value={image.promptText} text={text} /></header>
                <pre>{image.promptText}</pre>
              </article>
            ) : null}
            <article className="aitag-data-block">
              <details className="aitag-original-details">
                <summary><span>{text.metadata}</span><small>{report?.entries.length ?? 0}</small></summary>
                <div className="aitag-original-details-body">
                  <header><h3>{text.metadata}</h3><CopyButton value={metadata} text={text} /></header>
                  {report?.entries.length ? (
                    <div className="metadata-param-list aitag-param-list">
                      {report.entries.map((entry, index) => (
                        <article key={`${entry.group}-${entry.key}-${index}`}>
                          <div><span>{groupLabel(language, entry.group)}</span><strong>{parameterLabel(language, entry.key)}</strong></div>
                          <pre>{entry.value}</pre>
                          <CopyButton value={entry.value} text={text} />
                        </article>
                      ))}
                    </div>
                  ) : <p>{text.noMetadata}</p>}
                  {metadata ? <details className="aitag-raw-details"><summary>{text.metadata}</summary><pre>{metadata}</pre></details> : null}
                </div>
              </details>
            </article>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main ref={pageRef} className="aitag-page">
      <header className="aitag-header">
        <div>
          {onBack ? <button type="button" className="btn secondary compact" onClick={onBack}>{text.back}</button> : null}
          <div className="online-gallery-title-line">
            <h2>{text.title}</h2>
            <GallerySourcePicker value={gallerySource} onChange={setGallerySource} text={text} />
          </div>
          <p>{text.subtitle}</p>
        </div>
        <div className="aitag-header-actions">
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void refresh()}>{text.refresh}</button>
          <button type="button" className="btn secondary" onClick={() => void window.naiDesktop.openExternal(AITAG_SITE_URL)}>{text.source}</button>
        </div>
      </header>

      <section className="aitag-search-panel">
        <div className="aitag-search-fields">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(1); }} placeholder={text.query} />
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(1); }} placeholder={text.prompt} />
          <button type="button" className="btn primary" disabled={loading} onClick={() => void search(1)}>{text.search}</button>
        </div>
        <div className="aitag-sort-tabs">
          <button type="button" className={sort === "new" ? "active" : ""} onClick={() => { setSort("new"); setTimeRange("all"); void search(1, { sort: "new", timeRange: "all" }); }}>{text.newest}</button>
          <button type="button" className={sort === "monthly" ? "active" : ""} onClick={() => { setSort("monthly"); setTimeRange("current"); void search(1, { sort: "monthly", timeRange: "current" }); }}>{text.monthly}</button>
          <label className="aitag-time-filter">
            <span>{text.timeRange}</span>
            <SelectMenuCompat value={timeRange} onChange={(event) => { const value = event.target.value; setTimeRange(value); void search(1, { timeRange: value }); }}>
              {timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectMenuCompat>
          </label>
          <SelectMenu className="gallery-page-size-picker" value={String(pageSize)} ariaLabel={text.itemsPerPage} label={text.itemsPerPage} options={GALLERY_PAGE_SIZE_OPTIONS.map((item) => ({ value: String(item), label: String(item) }))} onChange={(next) => { const size = Number(next); setPageSize(size); void search(1, { pageSize: size }); }} />
          <span>{interpolate(text.total, "count", result.total)}</span>
        </div>
      </section>

      {(loading && result.items.length === 0) || detailLoading ? <div className="aitag-state">{text.loading}</div> : null}
      {error ? <div className="aitag-state error"><span>{text.failed}</span><button type="button" className="btn secondary" onClick={() => void search(page)}>{text.retry}</button></div> : null}
      {!loading && !error && result.items.length === 0 ? <div className="aitag-state">{text.empty}</div> : null}
      {!error && result.items.length > 0 ? (
        <section className="aitag-work-grid">
          {result.items.map((work) => <WorkCard key={work.id} work={work} config={config} text={text} loadDetail={loadDetail} onOpen={(item) => void openWork(item)} />)}
        </section>
      ) : null}

      {!error && result.items.length > 0 ? (
        <nav className="aitag-pagination" aria-label={text.page}>
          <button type="button" className="btn secondary" disabled={page <= 1 || pendingPage !== null} onClick={() => void search(page - 1)}>{text.previous}</button>
          <GalleryPageNumberInput page={pendingPage ?? page} pageCount={maxPage} disabled={pendingPage !== null} text={text} onChange={(next) => void search(next)} />
          <b aria-live="polite">{pendingPage ? formatText(text.loadingPage, { page: pendingPage }) : formatText(text.pagePosition, { page, pages: maxPage })}</b>
          <button type="button" className="btn secondary" disabled={page >= maxPage || pendingPage !== null} onClick={() => void search(page + 1)}>{text.next}</button>
        </nav>
      ) : null}
    </main>
  );
}
