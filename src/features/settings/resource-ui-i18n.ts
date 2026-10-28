import type { AppLanguage, ResourceDatabaseId, ResourceDatabaseProgressEvent } from "../../types";

const TEXT = {
  title: "模型与资源库", subtitle: "资源路径和可替换的本地补全数据库。不会把用户图片当作缓存删除。", localModel: "本地 ONNX Tagger 模型", unavailable: "未配置（当前版本尚未接入本地 ONNX Tagger）", dataPath: "数据存储路径", loading: "读取中…", databases: "数据源与本地数据库", databaseHint: "数据库只能在你确认后替换；替换前会留下上一版回滚副本。", mergeTitle: "图片数据始终合并，不参与数据库覆盖。", mergeHint: "相同内容跳过；同名不同内容使用“(1)”递增；参考预设、日期分组和历史只合并。", source: "来源", pause: "暂停", resume: "继续下载", update: "更新 / 修复", install: "下载并安装", restore: "恢复上一版", preparing: "正在准备", prepareDownload: "准备下载…", reading: "正在读取资源状态…", installed: "已安装 · {version} · {size}", invalid: "数据库异常：{message}", repair: "需要修复", downloaded: "已下载 {size}，可继续", notInstalled: "未安装 · 下载 {size}", sourceLine: "来源：{source} · {license}", cacheTitle: "缓存维护", cacheHint: "查看三级数据状态；清理只移除可再生成的缓存，不删除数据库或用户图片。", memory: "L1 内存查询缓存", entries: "{count} 条 · 命中率 {rate}%", gallery: "L2 在线画廊磁盘缓存", files: "{count} 个文件 · {size}", sqlite: "L3 SQLite 资源数据库", databaseCount: "{count} 个数据库 · {size}", rescan: "重新扫描", clear: "清理可再生成缓存", cleared: "内存查询缓存和在线画廊磁盘缓存已清理；资源数据库未删除。", confirmInstall: "确认替换本地资源数据库", confirmRestore: "确认恢复上一版数据库", confirmBody: "此操作只替换所选的本地标签/关联数据库，并保留可回滚副本。不会覆盖、重命名或删除任何生成图片、参考图、参考预设、收藏夹或历史记录。", cancel: "取消", agreeInstall: "同意并开始", agreeRestore: "同意恢复", tagCatalog: "基础 Danbooru 标签目录", tagCatalogDesc: "完整标签、类别、热度与别名；安装后作为本地补全主数据库。", cooccurrence: "本地相关标签数据库", cooccurrenceDesc: "约 323 万组共现关系；安装后替代内置小型相关推荐表。", downloading: "正在下载", paused: "已暂停", verifying: "正在校验", extracting: "正在解压", installing: "正在安全替换", complete: "安装完成", error: "下载失败",
};

type Key = keyof typeof TEXT;

export function resourceText(_language: AppLanguage, key: Key, values: Record<string, unknown> = {}) {
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), TEXT[key]);
}

export function resourcePhaseText(language: AppLanguage, phase: ResourceDatabaseProgressEvent["phase"]) {
  return resourceText(language, phase);
}

export function resourceDefinitionText(language: AppLanguage, id: ResourceDatabaseId) {
  return id === "tagCatalog"
    ? { label: resourceText(language, "tagCatalog"), description: resourceText(language, "tagCatalogDesc") }
    : { label: resourceText(language, "cooccurrence"), description: resourceText(language, "cooccurrenceDesc") };
}
