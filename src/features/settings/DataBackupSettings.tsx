import {DATA_BACKUP_CATEGORIES} from "../../data-backup-contract";
import { useEffect, useMemo, useState } from "react";
import { Button, CommittedNumberInput, IconText, Toggle } from "../../components/ui";
import { Icon } from "../../components/icons";
import { normalizeAppLanguage } from "../../i18n";
import { flushArtistFavoritePersistence, hydrateArtistFavoriteLibrary } from "../../artist-favorite-library";
import { useAppStore } from "../../store";
import type {
  AppLanguage,
  AppSettings,
  DataBackupCategory,
  DataBackupInspectResult,
  DataBackupStatus,
  DataBackupRecovery,
} from "../../types";
import {
  collectPortableWorkspaceData,
  mergePortableWorkspaceData,
} from "./data-backup-workspace";

const CATEGORIES: DataBackupCategory[] = [...DATA_BACKUP_CATEGORIES];

const TEXT = {
  "zh-CN": {
    available: "已有恢复副本；可打开核对或恢复使用",
    exportDone: "备份已保存：",
    importDone: "导入完成：新增 {i} 项，跳过 {s} 项，重命名 {r} 项。",
    restoreGuide: "选择备份文件即可恢复；先核对分类，再确认导入。",
    retained: "新版桌面归档已保管 {count} 份；未在移动端运行。导出上述两项后，在桌面导入并使用恢复入口。",
    rescue: "导入前完整备份：",
    preserved: "原数据保留位置：",
    activateHelp: "恢复前将保留当前工作区，再切换到所选数据；不会自动启动任务。模型和运行环境沿用本机配置，请确认兼容后手动启动。",
    activateRecovery: "恢复使用此数据…",
    openRecovery: "打开恢复目录",
    staged: "已保存在恢复目录，尚未替换当前工作区",
    restored: "已恢复；任务未启动",
    recoveryTitle: "恢复结果与入口",
    styleLab: "画风实验室：当前自动迭代结果与参考图",
    tavernAgent: "新版酒馆 Agent（工作区、插件、会话，可能含密钥）",
    coverage: "新版 Agent 独立备份，插件配置可能含密钥，不受应用 API 勾选项控制。备份前停止 Agent 与画风任务。旧版角色数据仅作兼容；移动端仅保管新版桌面数据，导回桌面再恢复。模型、运行环境与符号链接不迁移。自动轻量备份不含新版工作区及画风结果，请使用完整备份。",
    portabilityTitle: "跨端数据导入与导出",
    portabilityDesc: "生成一个桌面端、Android 与 iOS 共用的 .naisbackup 归档。默认选择全部数据，可逐项排除。",
    sensitive: "API Token 与第三方密钥会按你的选择直接写入备份，请只把文件交给可信设备。",
    selectAll: "全选",
    clear: "清空",
    export: "导出所选数据",
    exporting: "正在整理备份…",
    chooseImport: "选择备份文件",
    importing: "正在安全合并…",
    importSelected: "导入所选数据",
    archive: "待导入归档",
    firstConfirmTitle: "确认合并所选数据",
    firstConfirm: "所选数据均独立处理。常规记录只合并；新版 Agent 与画风结果先保存完整恢复副本，当前工作区存在时需在导入结果中手动切换。导入前会生成完整备份。",
    configConfirmTitle: "再次确认覆盖配置",
    configConfirm: "配置/API 类会覆盖现有对应配置（设备路径除外）。图片、画师收藏、提示词预设、参考预设和历史仍只做非破坏合并。",
    cancel: "取消",
    continue: "继续",
    overwrite: "确认覆盖并导入",
    noCategory: "请至少选择一类数据。",
    autoTitle: "自动备份与恢复",
    autoDesc: "自动备份默认开启并采用轻量模式，不会在启动后压缩整套图库。需要时可单独开启图片备份。",
    autoEnabled: "启用自动备份",
    autoEnabledDesc: "应用启动后在后台检查是否到期；导入前无条件额外创建安全备份。",
    includeImages: "自动备份包含图片与参考图",
    includeImagesDesc: "开启后会复制整套图库，耗时与空间占用会明显增加；手动导出不受影响。",
    interval: "备份间隔（小时）",
    retention: "保留自动备份数量",
    directory: "备份目录",
    chooseDirectory: "选择目录",
    openDirectory: "打开目录",
    backupNow: "立即完整备份",
    refresh: "刷新状态",
    latest: "最近备份",
    none: "尚无自动备份",
    count: "{count} 个自动备份 · {size}",
    config: "应用配置",
    api: "API 与敏感数据",
    agent: "移动端角色与旧版对话（兼容数据）",
    artists: "画师串与独立收藏夹",
    textHistory: "反推与转换历史",
    references: "参考预设与参考图",
    images: "本机图片与生成记录",
    prompts: "提示词、风格与预设图",
    workspace: "工具草稿、画风参数与其他本机状态",
  },
  "zh-TW": {
    available: "已有復原副本；可開啟核對或復原使用",
    exportDone: "備份已儲存：",
    importDone: "匯入完成：新增 {i} 項，略過 {s} 項，重新命名 {r} 項。",
    restoreGuide: "選擇備份檔即可復原；先核對分類，再確認匯入。",
    retained: "已保管 {count} 份新版桌面封存；未在行動端執行。匯出上述兩項後，在桌面匯入並使用復原入口。",
    rescue: "匯入前完整備份：",
    preserved: "原資料保留位置：",
    activateHelp: "復原前會保留目前工作區，再切換到所選資料；不會自動啟動任務。模型和執行環境沿用本機設定，請確認相容後手動啟動。",
    activateRecovery: "復原並使用此資料…",
    openRecovery: "開啟復原目錄",
    staged: "已保存至復原目錄，尚未取代目前工作區",
    restored: "已復原；任務未啟動",
    recoveryTitle: "復原結果與入口",
    styleLab: "畫風實驗室：目前自動迭代結果與參考圖",
    tavernAgent: "新版酒館 Agent（工作區、外掛、對話，可能含金鑰）",
    coverage: "新版 Agent 獨立備份，外掛設定可能含金鑰，不受應用 API 勾選項控制。備份前停止 Agent 與畫風任務。舊版角色資料僅供相容；行動端僅保管新版桌面資料，匯回桌面再復原。模型、執行環境與符號連結不遷移。自動輕量備份不含新版工作區及畫風結果，請使用完整備份。",
    portabilityTitle: "跨端資料匯入與匯出", portabilityDesc: "建立桌面、Android 與 iOS 共用的 .naisbackup；預設全選，可逐項排除。", sensitive: "API Token 與第三方金鑰會依選擇直接寫入備份，請只交給可信裝置。", selectAll: "全選", clear: "清空", export: "匯出所選資料", exporting: "正在整理備份…", chooseImport: "選擇備份檔", importing: "正在安全合併…", importSelected: "匯入所選資料", archive: "待匯入封存", firstConfirmTitle: "確認合併所選資料", firstConfirm: "各項資料獨立處理。一般記錄只合併；新版 Agent 與畫風結果先保存完整復原副本，已有工作區時須在匯入結果手動切換。匯入前會建立完整備份。", configConfirmTitle: "再次確認覆蓋設定", configConfirm: "設定/API 類會覆蓋現有對應設定（裝置路徑除外）；其它資料仍只合併。", cancel: "取消", continue: "繼續", overwrite: "確認覆蓋並匯入", noCategory: "請至少選擇一類資料。", autoTitle: "自動備份與還原", autoDesc: "預設開啟並採用輕量模式，不會在啟動後壓縮整套圖庫。", autoEnabled: "啟用自動備份", autoEnabledDesc: "啟動後背景檢查；匯入前一定另建安全備份。", includeImages: "自動備份包含圖片與參考圖", includeImagesDesc: "開啟後耗時與空間占用會增加；手動匯出不受影響。", interval: "備份間隔（小時）", retention: "保留自動備份數量", directory: "備份目錄", chooseDirectory: "選擇目錄", openDirectory: "開啟目錄", backupNow: "立即完整備份", refresh: "更新狀態", latest: "最近備份", none: "尚無自動備份", count: "{count} 個自動備份 · {size}", config: "應用設定", api: "API 與敏感資料", agent: "行動端角色與舊版對話（相容資料）", artists: "畫家串與獨立收藏", textHistory: "反推與轉換歷史", references: "參考預設與參考圖", images: "本機圖片與生成記錄", prompts: "提示詞、風格與預設圖", workspace: "工具草稿、畫風參數與其他本機狀態",
  },
  "en-US": {
    available: "Saved recovery copy; inspect or activate it",
    exportDone: "Backup saved:",
    importDone: "Import complete: {i} added, {s} skipped, {r} renamed.",
    restoreGuide: "To restore, choose the backup file, review categories, then confirm import.",
    retained: "Retained {count} native desktop archives without running them. Export the two native categories, import on desktop, then use the recovery actions.",
    rescue: "Full backup before import:",
    preserved: "Previous data preserved at:",
    activateHelp: "Current data will be preserved before switching to this recovery. Tasks will not start automatically. Local model/runtime settings remain; verify compatibility before starting manually.",
    activateRecovery: "Activate this recovery…",
    openRecovery: "Open recovery folder",
    staged: "Staged only; current workspace unchanged",
    restored: "Restored; tasks not started",
    recoveryTitle: "Recovery results and actions",
    styleLab: "Style Lab: current iteration results and reference",
    tavernAgent: "Tavern Agent (profiles, plugins, chats; may contain keys)",
    coverage: "Tavern Agent is backed up independently; plugin settings may contain keys regardless of the application API checkbox. Stop Agent and style tasks first. Legacy characters remain for compatibility. Mobile only retains native desktop data for return to desktop. Models, runtimes and symbolic links are excluded. Lightweight automatic backups exclude native workspaces and style results; use a full backup.",
    portabilityTitle: "Cross-device data import and export", portabilityDesc: "Create one .naisbackup archive shared by desktop, Android, and iOS. Everything is selected by default.", sensitive: "API tokens and third-party keys are written directly when selected. Only share the archive with trusted devices.", selectAll: "Select all", clear: "Clear", export: "Export selected data", exporting: "Preparing archive…", chooseImport: "Choose backup file", importing: "Merging safely…", importSelected: "Import selected data", archive: "Archive to import", firstConfirmTitle: "Confirm safe merge", firstConfirm: "Categories are independent. Regular records are merged; native Agent and style results are staged in full. Existing workspaces require an explicit switch from the results. A full rescue backup is created first.", configConfirmTitle: "Confirm configuration overwrite again", configConfirm: "Configuration/API categories replace matching settings (device paths are preserved). Images, favorites, presets, and history are still merge-only.", cancel: "Cancel", continue: "Continue", overwrite: "Overwrite settings and import", noCategory: "Select at least one category.", autoTitle: "Automatic backup and restore", autoDesc: "Automatic backups use lightweight mode by default and do not compress the full image library after launch.", autoEnabled: "Enable automatic backups", autoEnabledDesc: "Checks in the background after launch; imports always create an extra rescue backup.", includeImages: "Include images and references", includeImagesDesc: "Enabling this can significantly increase time and storage use. Manual exports are unaffected.", interval: "Backup interval (hours)", retention: "Automatic backups to keep", directory: "Backup directory", chooseDirectory: "Choose directory", openDirectory: "Open directory", backupNow: "Create full backup now", refresh: "Refresh status", latest: "Latest backup", none: "No automatic backup yet", count: "{count} automatic backups · {size}", config: "Application configuration", api: "APIs and sensitive data", agent: "Mobile characters and legacy chats (compatibility)", artists: "Artist strings and separate favorites", textHistory: "Reverse and conversion history", references: "Reference presets and images", images: "Local images and generation history", prompts: "Prompt/style presets and previews", workspace: "Tool drafts, style parameters and other local state",
  },
  "ja-JP": {
    available: "保存済みの復元コピー：確認または使用できます",
    exportDone: "バックアップ保存先：",
    importDone: "インポート完了：追加 {i}、スキップ {s}、名前変更 {r}。",
    restoreGuide: "バックアップを選び、項目を確認してインポートすると復元できます。",
    retained: "デスクトップ専用アーカイブ {count} 件を保管しました。モバイルでは実行しません。専用の2項目を書き出し、デスクトップで読み込んで復元してください。",
    rescue: "インポート前の完全バックアップ：",
    preserved: "以前のデータの保存先：",
    activateHelp: "現在のデータを退避してから切り替えます。タスクは自動起動しません。本機のモデルと実行環境を維持します。互換性を確認してから手動で起動してください。",
    activateRecovery: "このデータを使用…",
    openRecovery: "復元フォルダーを開く",
    staged: "復元フォルダーに保管・現在の作業領域は未変更",
    restored: "復元済み・タスク未起動",
    recoveryTitle: "復元結果と操作",
    styleLab: "画風ラボ：現在の反復結果と参照画像",
    tavernAgent: "新版 Tavern Agent（作業領域・プラグイン・会話、キーを含む場合あり）",
    coverage: "新版 Agent は独立して保存します。プラグイン設定のキーはアプリ API の選択とは別です。先に Agent と画風タスクを停止してください。旧キャラクターは互換用です。モバイルはデスクトップ専用データを保管し、デスクトップへ戻して復元します。モデル・実行環境・リンクは含みません。軽量自動バックアップには新版作業領域と画風結果を含まないため、完全バックアップを使用してください。",
    portabilityTitle: "端末間データの入出力", portabilityDesc: "デスクトップ・Android・iOS 共通の .naisbackup を作成します。初期状態は全選択です。", sensitive: "選択した API Token と外部キーはバックアップへ直接保存されます。信頼できる端末だけで共有してください。", selectAll: "全選択", clear: "解除", export: "選択データを書き出す", exporting: "バックアップを作成中…", chooseImport: "バックアップを選択", importing: "安全にマージ中…", importSelected: "選択データを読み込む", archive: "読み込み対象", firstConfirmTitle: "安全マージを確認", firstConfirm: "各項目は独立です。一般の記録はマージし、新版 Agent と画風結果は完全な復元コピーを保存します。既存領域がある場合は結果画面から手動で切り替えます。事前に完全バックアップを作成します。", configConfirmTitle: "設定上書きを再確認", configConfirm: "設定/API は対応項目を上書きします（端末固有パスを除く）。その他はマージのみです。", cancel: "キャンセル", continue: "続行", overwrite: "上書きを確認して読み込む", noCategory: "1項目以上選択してください。", autoTitle: "自動バックアップと復元", autoDesc: "初期状態は軽量モードで、起動後に画像ライブラリ全体を圧縮しません。", autoEnabled: "自動バックアップ", autoEnabledDesc: "起動後に期限を確認し、読み込み前には必ず追加の安全バックアップを作成します。", includeImages: "画像と参照画像を含める", includeImagesDesc: "有効にすると処理時間と保存容量が増えます。", interval: "間隔（時間）", retention: "保持数", directory: "保存先", chooseDirectory: "保存先を選択", openDirectory: "フォルダーを開く", backupNow: "完全バックアップを今すぐ作成", refresh: "状態更新", latest: "最新", none: "自動バックアップなし", count: "{count} 件 · {size}", config: "アプリ設定", api: "API と機密データ", agent: "モバイルのキャラクターと旧会話（互換データ）", artists: "画家列と独立お気に入り", textHistory: "逆推定・変換履歴", references: "参照プリセットと画像", images: "ローカル画像と生成履歴", prompts: "プロンプト・スタイル・プレビュー", workspace: "ツール下書き・画風パラメーター・その他の状態",
  },
  "ko-KR": {
    available: "저장된 복구 사본: 확인하거나 복원할 수 있습니다",
    exportDone: "백업 저장 위치:",
    importDone: "가져오기 완료: 추가 {i}, 건너뜀 {s}, 이름 변경 {r}.",
    restoreGuide: "복원하려면 백업 파일을 선택하고 항목을 확인한 후 가져오세요.",
    retained: "데스크톱 전용 백업 {count}개를 실행하지 않고 보관했습니다. 해당 두 항목을 내보내 데스크톱에서 가져온 후 복구 기능을 사용하세요.",
    rescue: "가져오기 전 전체 백업:",
    preserved: "이전 데이터 보존 위치:",
    activateHelp: "현재 데이터를 보존한 뒤 선택한 복구 데이터로 전환합니다. 작업은 자동 시작되지 않습니다. 로컬 모델과 실행 환경 설정은 유지되므로 호환성을 확인한 후 직접 시작하세요.",
    activateRecovery: "이 데이터로 복원…",
    openRecovery: "복구 폴더 열기",
    staged: "복구 폴더에 보관됨 · 현재 작업 공간 유지",
    restored: "복원됨 · 작업 시작 안 됨",
    recoveryTitle: "복구 결과 및 작업",
    styleLab: "화풍 실험실: 현재 반복 결과와 참조 이미지",
    tavernAgent: "새 Tavern Agent (작업 공간·플러그인·대화, 키 포함 가능)",
    coverage: "새 Agent는 별도로 백업합니다. 플러그인 설정의 키는 앱 API 선택과 무관하게 포함될 수 있습니다. 먼저 Agent와 화풍 작업을 중지하세요. 이전 캐릭터는 호환용입니다. 모바일은 데스크톱 전용 데이터를 보관한 후 데스크톱에서 복원합니다. 모델·실행 환경·링크는 제외됩니다. 경량 자동 백업에는 새 작업 공간과 화풍 결과가 없으므로 전체 백업을 사용하세요.",
    portabilityTitle: "기기 간 데이터 가져오기/내보내기", portabilityDesc: "데스크톱·Android·iOS 공용 .naisbackup을 만듭니다. 기본값은 전체 선택입니다.", sensitive: "선택한 API Token과 외부 키는 백업에 직접 저장됩니다. 신뢰하는 기기에서만 공유하세요.", selectAll: "전체 선택", clear: "해제", export: "선택 데이터 내보내기", exporting: "백업 준비 중…", chooseImport: "백업 파일 선택", importing: "안전하게 병합 중…", importSelected: "선택 데이터 가져오기", archive: "가져올 백업", firstConfirmTitle: "안전 병합 확인", firstConfirm: "각 항목은 독립적입니다. 일반 기록은 병합하고 새 Agent와 화풍 결과는 완전한 복구 사본으로 보관합니다. 기존 작업 공간이 있으면 결과 화면에서 직접 전환해야 합니다. 먼저 전체 백업을 만듭니다.", configConfirmTitle: "설정 덮어쓰기 재확인", configConfirm: "설정/API 항목은 대응 설정을 덮어씁니다(기기 경로 제외). 나머지는 병합만 합니다.", cancel: "취소", continue: "계속", overwrite: "덮어쓰기 확인 및 가져오기", noCategory: "항목을 하나 이상 선택하세요.", autoTitle: "자동 백업 및 복원", autoDesc: "기본은 경량 모드이며 시작 후 전체 이미지 라이브러리를 압축하지 않습니다.", autoEnabled: "자동 백업 사용", autoEnabledDesc: "시작 후 백그라운드에서 확인하며 가져오기 전에는 항상 안전 백업을 만듭니다.", includeImages: "이미지와 참고 이미지 포함", includeImagesDesc: "켜면 처리 시간과 저장 공간 사용량이 늘어납니다.", interval: "간격(시간)", retention: "보관 개수", directory: "백업 폴더", chooseDirectory: "폴더 선택", openDirectory: "폴더 열기", backupNow: "지금 전체 백업", refresh: "상태 새로고침", latest: "최근 백업", none: "자동 백업 없음", count: "{count}개 · {size}", config: "앱 설정", api: "API 및 민감 데이터", agent: "모바일 캐릭터 및 이전 대화 (호환 데이터)", artists: "작가 문자열과 독립 즐겨찾기", textHistory: "역추론 및 변환 기록", references: "참고 프리셋과 이미지", images: "로컬 이미지와 생성 기록", prompts: "프롬프트·스타일·미리보기", workspace: "도구 초안·화풍 매개변수 및 기타 로컬 상태",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const LABEL_KEY: Record<DataBackupCategory, keyof typeof TEXT["zh-CN"]> = {
  tavernAgent: "tavernAgent",
  styleLab: "styleLab",
  configuration: "config",
  apiCredentials: "api",
  agentWorkspace: "agent",
  artistLibrary: "artists",
  textHistory: "textHistory",
  referencePresets: "references",
  imageHistory: "images",
  promptPresets: "prompts",
  workspaceData: "workspace",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function useText(language: AppSettings["language"] | undefined) {
  return TEXT[normalizeAppLanguage(language)];
}

function CategoryChecklist({
  available = CATEGORIES,
  selected,
  setSelected,
  language,
  summaries,
}: {
  available?: DataBackupCategory[];
  selected: Set<DataBackupCategory>;
  setSelected: (next: Set<DataBackupCategory>) => void;
  language: AppSettings["language"] | undefined;
  summaries?: DataBackupInspectResult["categories"];
}) {
  const text = useText(language);
  const summaryMap = new Map(summaries?.map((item) => [item.category, item]));
  return (
    <div className="data-category-checklist">
      {available.map((category) => {
        const info = summaryMap.get(category);
        return (
          <label key={category} className="data-category-row">
            <input
              type="checkbox"
              checked={selected.has(category)}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(category);
                else next.delete(category);
                setSelected(next);
              }}
            />
            <span><strong>{text[LABEL_KEY[category]]}</strong>{info ? <small>{info.items} · {formatBytes(info.bytes)}</small> : null}</span>
          </label>
        );
      })}
    </div>
  );
}

export function DataPortabilitySettings({
  language,
}: {
  language: AppSettings["language"] | undefined;
}) {
  const text = useText(language);
  const [exportSelection, setExportSelection] = useState<Set<DataBackupCategory>>(() => new Set(CATEGORIES));
  const [importSelection, setImportSelection] = useState<Set<DataBackupCategory>>(() => new Set());
  const [archive, setArchive] = useState<DataBackupInspectResult | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | "">("");
  const [message, setMessage] = useState("");
  const [confirmStage, setConfirmStage] = useState<0 | 1 | 2>(0);
  const [recoveries,setRecoveries] = useState<DataBackupRecovery[]>([]);
  const [rescuePath,setRescuePath] = useState("");
  const [activate,setActivate] = useState<DataBackupRecovery|null>(null);
  useEffect(()=>{
    let cancelled=false;
    window.naiDesktop.listPortableRecoveries().then(items=>{if(!cancelled)setRecoveries(items);})
      .catch(error=>{if(!cancelled)setMessage(String(error));});
    return()=>{cancelled=true;};
  },[]);
  const performActivation = async () => {
    if(!activate)return;
    setBusy("import");
    try {
      const result=await window.naiDesktop.activatePortableRecovery(activate.kind,activate.id);
      setRecoveries(items=>items.map(item=>item.id===activate.id?{...item,status:"restored"}:item));
      setMessage(text.preserved+" "+result.preserved);
      window.dispatchEvent(new Event("langbai:workspace-imported"));
      setActivate(null);
    } catch(error) {setMessage(String(error));} finally {setBusy("");}
  };
  const availableImport = useMemo(
    () => archive?.categories.map((item) => item.category) ?? [],
    [archive],
  );

  const exportSelected = async () => {
    if (!exportSelection.size) return setMessage(text.noCategory);
    setBusy("export");
    setMessage("");
    try {
      await flushArtistFavoritePersistence();
      const result = await window.naiDesktop.exportDataBackup({
        categories: [...exportSelection],
        workspaceData: collectPortableWorkspaceData(),
      });
      setMessage(result.ok ? text.exportDone+" "+(result.path ?? "") : result.message);
    } catch(error) { setMessage(String(error)); } finally {
      setBusy("");
    }
  };

  const chooseImport = async () => {
    setMessage("");
    let result: DataBackupInspectResult;
    try { result = await window.naiDesktop.inspectDataBackup(); } catch(error) { setMessage(String(error)); return; }
    if (!result.ok) {
      if (!result.cancelled) setMessage(result.message ?? "");
      return;
    }
    setArchive(result);
    setImportSelection(new Set(result.categories.map((item) => item.category)));
    setConfirmStage(0);
  };

  const runImport = async (confirmConfigurationOverwrite: boolean) => {
    if (!archive?.path || !importSelection.size) return setMessage(text.noCategory);
    setBusy("import");
    setConfirmStage(0);
    try {
      await flushArtistFavoritePersistence();
      const result = await window.naiDesktop.importDataBackup({
        path: archive.path,
        categories: [...importSelection],
        confirmConfigurationOverwrite,
        currentWorkspaceData: collectPortableWorkspaceData(),
      });
      if (result.workspaceData) {
        const merged = mergePortableWorkspaceData(result.workspaceData);
        result.imported += merged.imported;
        result.skipped += merged.skipped;
      }
      setMessage(result.ok ? text.importDone.replace("{i}",String(result.imported)).replace("{s}",String(result.skipped)).replace("{r}",String(result.renamed)) : result.message);
      setRecoveries(result.recoveries ?? []);
      setRescuePath(result.rescueBackupPath ?? "");
      if (result.ok) {
        // Rehydrate the live renderer instead of requiring a restart before
        // imported configuration, parameters, histories, and groups appear.
        await useAppStore.getState().load();
        await hydrateArtistFavoriteLibrary();
        window.dispatchEvent(new Event("langbai:reference-presets-changed"));
        window.dispatchEvent(new Event("langbai:workspace-imported"));
      }
    } catch(error) { setMessage(String(error)); } finally {
      setBusy("");
    }
  };

  const firstConfirmed = () => {
    const overwrites = importSelection.has("configuration") || importSelection.has("apiCredentials");
    if (overwrites) setConfirmStage(2);
    else void runImport(false);
  };

  return (
    <div className="data-portability-panel settings-section-card">
      <div className="settings-section-heading">
        <span className="settings-section-icon"><Icon name="database" /></span>
        <div><strong>{text.portabilityTitle}</strong><span>{text.portabilityDesc}</span><span>{text.coverage}</span></div>
      </div>
      <div className="data-sensitive-note"><Icon name="warning" /><span>{text.sensitive}</span></div>
      <div className="data-selection-toolbar">
        <Button variant="ghost" onClick={() => setExportSelection(new Set(CATEGORIES))}>{text.selectAll}</Button>
        <Button variant="ghost" onClick={() => setExportSelection(new Set())}>{text.clear}</Button>
      </div>
      <CategoryChecklist selected={exportSelection} setSelected={setExportSelection} language={language} />
      <div className="row-actions data-primary-actions">
        <Button variant="primary" disabled={Boolean(busy) || !exportSelection.size} onClick={() => void exportSelected()}>
          <IconText icon={busy === "export" ? <Icon name="loader" /> : <Icon name="archive" />}>{busy === "export" ? text.exporting : text.export}</IconText>
        </Button>
        <Button disabled={Boolean(busy)} onClick={() => void chooseImport()}>
          <IconText icon={<Icon name="upload" />}>{text.chooseImport}</IconText>
        </Button>
      </div>
      {archive?.ok && (
        <div className="data-import-preview">
          <div className="data-import-file"><Icon name="archive" /><span><strong>{text.archive}</strong><small>{archive.createdAt ? new Date(archive.createdAt).toLocaleString() : ""} · {archive.sourcePlatform} · v{archive.appVersion}</small></span></div>
          <CategoryChecklist available={availableImport} selected={importSelection} setSelected={setImportSelection} language={language} summaries={archive.categories} />
          <Button variant="primary" disabled={Boolean(busy) || !importSelection.size} onClick={() => setConfirmStage(1)}>
            <IconText icon={busy === "import" ? <Icon name="loader" /> : <Icon name="restore" />}>{busy === "import" ? text.importing : text.importSelected}</IconText>
          </Button>
        </div>
      )}
      {confirmStage > 0 && (
        <div className="data-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="data-confirm-card">
            <span className="data-confirm-icon"><Icon name={confirmStage === 2 ? "warning" : "restore"} /></span>
            <div><strong>{confirmStage === 2 ? text.configConfirmTitle : text.firstConfirmTitle}</strong><p>{confirmStage === 2 ? text.configConfirm : text.firstConfirm}</p></div>
            <div className="row-actions">
              <Button onClick={() => setConfirmStage(0)}>{text.cancel}</Button>
              <Button variant={confirmStage === 2 ? "danger" : "primary"} onClick={() => confirmStage === 2 ? void runImport(true) : firstConfirmed()}>{confirmStage === 2 ? text.overwrite : text.continue}</Button>
            </div>
          </div>
        </div>
      )}
      {rescuePath && <div className="status-box"><strong>{text.rescue}</strong><p style={{overflowWrap:"anywhere"}}>{rescuePath}</p><p>{text.restoreGuide}</p></div>}
      {!!recoveries.length && <section className="settings-section-card" aria-label={text.recoveryTitle}>
        <h4>{text.recoveryTitle}</h4>
        {recoveries.map(item=><div className="status-box" key={item.id}>
          <strong>{item.kind==="agent"?text.tavernAgent:text.styleLab}</strong>
          <p>{text[item.status]}</p><p style={{overflowWrap:"anywhere"}}>{item.path}</p>
          <div className="row-actions">
            <Button disabled={!!busy} onClick={()=>void window.naiDesktop.openPortableRecovery(item.kind,item.id).catch(e=>setMessage(String(e)))}>{text.openRecovery}</Button>
            {item.status!=="restored" && <Button disabled={!!busy} onClick={()=>setActivate(item)}>{text.activateRecovery}</Button>}
          </div>
        </div>)}
      </section>}
      {activate && <div className="data-confirm-backdrop" role="dialog" aria-modal="true" aria-label={text.activateRecovery}>
        <div className="data-confirm-card"><div><strong>{text.activateRecovery}</strong><p>{text.activateHelp}</p></div>
        <div className="row-actions"><Button disabled={!!busy} onClick={()=>setActivate(null)}>{text.cancel}</Button><Button disabled={!!busy} onClick={()=>void performActivation()}>{text.continue}</Button></div></div>
      </div>}
      {message && <div className="status-box" role="status">{message}</div>}
    </div>
  );
}

export function BackupRestoreSettings({
  settings,
  update,
}: {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}) {
  const text = useText(settings.language);
  const [status, setStatus] = useState<DataBackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = () => window.naiDesktop.getDataBackupStatus().then(setStatus).catch(() => undefined);
  useEffect(() => { void refresh(); }, [settings.backupDir, settings.autoBackupEnabled, settings.autoBackupIntervalHours, settings.autoBackupRetentionCount]);

  const chooseDirectory = async () => {
    try {
      const selected = await window.naiDesktop.selectBackupDirectory();
      if (!selected) return;
      await update("backupDir", selected); await refresh(); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      await flushArtistFavoritePersistence();
      const result = await window.naiDesktop.exportDataBackup({
        categories: CATEGORIES,
        workspaceData: collectPortableWorkspaceData(),
        destination: "internal",
      });
      setMessage(result.ok ? text.exportDone+" "+(result.path ?? "") : result.message);
      await refresh();
    } catch(error) {setMessage(String(error));} finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form backup-restore-settings">
      <div className="settings-section-card">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="cloudSync" /></span>
          <div><strong>{text.autoTitle}</strong><span>{text.autoDesc}</span></div>
        </div>
        <div className="toggle-list">
          <Toggle checked={settings.autoBackupEnabled !== false} onChange={(value) => void update("autoBackupEnabled", value)} label={text.autoEnabled} description={text.autoEnabledDesc} />
          <Toggle checked={settings.autoBackupIncludeImages !== false} onChange={(value) => void update("autoBackupIncludeImages", value)} label={text.includeImages} description={text.includeImagesDesc} />
        </div>
        <div className="backup-number-grid">
          <CommittedNumberInput label={text.interval} value={settings.autoBackupIntervalHours ?? 24} min={1} max={720} normalize={(value) => Math.max(1, Math.min(720, Math.round(value)))} onCommit={(value) => void update("autoBackupIntervalHours", value)} />
          <CommittedNumberInput label={text.retention} value={settings.autoBackupRetentionCount ?? 7} min={1} max={100} normalize={(value) => Math.max(1, Math.min(100, Math.round(value)))} onCommit={(value) => void update("autoBackupRetentionCount", value)} />
        </div>
        <label className="field"><span>{text.directory}</span><input readOnly value={status?.directory ?? settings.backupDir ?? ""} /></label>
        <div className="row-actions">
          <Button onClick={() => void chooseDirectory()}><IconText icon={<Icon name="folderOpen" />}>{text.chooseDirectory}</IconText></Button>
          <Button onClick={() => void window.naiDesktop.openBackupDirectory().catch(error=>setMessage(String(error)))}><IconText icon={<Icon name="externalLink" />}>{text.openDirectory}</IconText></Button>
          <Button variant="primary" disabled={busy} onClick={() => void backupNow()}><IconText icon={busy ? <Icon name="loader" /> : <Icon name="archive" />}>{text.backupNow}</IconText></Button>
        </div>
      </div>
      <div className="backup-status-card">
        <Icon name="history" />
        <div><strong>{text.latest}</strong><span>{status?.latestCreatedAt ? new Date(status.latestCreatedAt).toLocaleString() : text.none}</span><small>{text.count.replace("{count}", String(status?.backupCount ?? 0)).replace("{size}", formatBytes(status?.totalBytes ?? 0))}</small></div>
        <Button variant="ghost" onClick={() => void refresh()}><IconText icon={<Icon name="refresh" />}>{text.refresh}</IconText></Button>
      </div>
      {message && <div className="status-box">{message}</div>}
    </div>
  );
}
