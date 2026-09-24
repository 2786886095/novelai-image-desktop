import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import JSZip from "jszip";
import sharp from "sharp";
import type {
  ComparisonEntry,
  ComparisonJob,
  ComparisonProject,
  ComparisonRun,
} from "../../src/artist-comparison/model";

/** A human-readable workbook report is intentionally separate from the ZIP backup. */
export interface SpreadsheetExportReport {
  images: number;
  missingImages: number;
  bytes: number;
}

interface EntryRecord {
  run: ComparisonRun;
  job: ComparisonJob;
}

interface PreviewInfo {
  job?: ComparisonJob;
  source: string;
}

interface ExportRow {
  entry: ComparisonEntry;
  records: EntryRecord[];
  latest?: EntryRecord;
  selected?: EntryRecord;
  preview: PreviewInfo;
  /** Filled in when a source image cannot be read. */
  missingImage: boolean;
  mediaName?: string;
  previewWidth?: number;
  previewHeight?: number;
  previewKey?: string;
}

interface Thumbnail {
  mediaName: string;
  filePath: string;
  width: number;
  height: number;
}

interface CellText {
  kind: "text";
  value: string;
}

interface CellNumber {
  kind: "number";
  value: number;
}

type CellValue = CellText | CellNumber | null;

const PREVIEW_MAX_EDGE = 480;
const PREVIEW_JPEG_QUALITY = 78;
const PREVIEW_FRAME_WIDTH = 160;
const PREVIEW_FRAME_HEIGHT = 150;
const PX_TO_EMU = 9_525;
const MAX_EXCEL_COLUMN_WIDTH = 255;

function text(value: unknown): CellText {
  return { kind: "text", value: value == null ? "" : String(value) };
}

function number(value: unknown): CellNumber | CellText {
  return typeof value === "number" && Number.isFinite(value)
    ? { kind: "number", value }
    : text(value);
}

/** XML 1.0 permits tabs, LF and CR, but not the other C0 control characters. */
function xmlSafeText(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff)
    ) {
      result += character;
    }
  }
  return result;
}

function xmlEscape(value: unknown): string {
  return xmlSafeText(String(value ?? ""))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function cellReference(row: number, column: number): string {
  return `${columnName(column)}${row}`;
}

function inlineStringCell(reference: string, value: string, style: number): string {
  const clean = xmlSafeText(value);
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(clean)}</t></is></c>`;
}

function numericCell(reference: string, value: number, style: number): string {
  return `<c r="${reference}" s="${style}" t="n"><v>${Number.isFinite(value) ? String(value) : ""}</v></c>`;
}

function cellXml(reference: string, value: CellValue, style: number): string {
  if (value === null || value.kind === "text")
    return inlineStringCell(reference, value?.value ?? "", style);
  return numericCell(reference, value.value, style);
}

function rowXml(rowNumber: number, values: CellValue[], style: number, height?: number): string {
  const customHeight = height === undefined ? "" : ` ht="${height}" customHeight="1"`;
  const cells = values.map((value, index) => cellXml(cellReference(rowNumber, index), value, style)).join("");
  return `<row r="${rowNumber}"${customHeight}>${cells}</row>`;
}

function tagsFor(entry: ComparisonEntry, project: ComparisonProject): string {
  const labels = new Map((project.tags ?? []).map((tag) => [tag.id, tag.label]));
  return (entry.tagIds ?? [])
    .map((tagId) => labels.get(tagId))
    .filter((label): label is string => Boolean(label))
    .join("、");
}

function ratingFor(entry: ComparisonEntry, project: ComparisonProject): string {
  return project.ratings.find((rating) => rating.id === entry.ratingId)?.label ?? "";
}

function indexRecords(project: ComparisonProject): Map<string, EntryRecord[]> {
  const prompts = new Map(project.entries.map(entry => [entry.id, entry.prompt]));
  const result = new Map<string, EntryRecord[]>();
  for (const run of project.runs) {
    const validIds = new Set(run.entries.filter(entry => prompts.get(entry.id) === entry.prompt).map(entry => entry.id));
    for (const job of run.jobs) {
      if (!validIds.has(job.entryId)) continue;
      const records = result.get(job.entryId) ?? [];
      records.push({ run, job });
      result.set(job.entryId, records);
    }
  }
  return result;
}

function choosePreview(entry: ComparisonEntry, records: EntryRecord[]): PreviewInfo {
  const selected = entry.coverJobId === undefined || entry.coverJobId === null
    ? undefined
    : records.find((record) =>
      record.job.id === entry.coverJobId && record.job.status === "done" && Boolean(record.job.image),
    );
  if (selected) return { job: selected.job, source: "已选封面" };

  const latestDone = [...records].reverse().find((record) =>
    record.job.status === "done" && Boolean(record.job.image),
  );
  if (latestDone) {
    return {
      job: latestDone.job,
      source: entry.coverJobId === null ? "无显式封面，自动使用最新生成图" : "自动使用最新生成图",
    };
  }
  return { source: records.length ? "暂无可读取的完成图片" : "暂无生成图片" };
}

function latestRecord(records: EntryRecord[]): EntryRecord | undefined {
  return records.length ? records[records.length - 1] : undefined;
}

function statusFor(row: ExportRow): string {
  if (!row.records.length) return "未生成";
  const counts = new Map<string, number>();
  for (const record of row.records)
    counts.set(record.job.status, (counts.get(record.job.status) ?? 0) + 1);
  const labels: Record<string, string> = {
    pending: "待生成",
    running: "生成中",
    done: "已完成",
    failed: "失败",
    uncertain: "待核对",
    skipped: "重复跳过",
  };
  const latest = row.latest?.job.status ?? "";
  const suffix = counts.size > 1 || (counts.get(latest) ?? 0) > 1
    ? `（${[...counts.entries()].map(([key, count]) => `${labels[key] ?? key} ${count}`).join("，")}）`
    : "";
  return `${labels[latest] ?? latest}${suffix}`;
}

function paramsCells(row: ExportRow): CellValue[] {
  const record = row.selected ?? row.latest;
  if (!record) return Array.from({ length: 18 }, () => text(""));
  const { run, job } = record;
  const params = run.params;
  return [
    text(run.id),
    number(job.seed),
    text(run.positive),
    text(run.negative),
    text(params.model),
    number(params.width),
    number(params.height),
    number(params.steps),
    number(params.cfgScale),
    number(params.cfgRescale),
    text(params.sampler),
    text(params.noiseSchedule),
    text("fixed"),
    text(params.qualityPreset),
    text(params.transparentBackground ? "是" : "否"),
    text(`${params.smea ? "SMEA" : ""}${params.smeaDyn ? " + 动态" : ""}${params.variety ? " + Variety" : ""}`),
    number(params.ucPreset), text(params.qualityToggle ? "是" : "否"),
  ];
}

const ENTRY_HEADERS = [
  "预览图", "名称", "画师提示词", "评级", "标签", "备注", "是否入池", "图状态", "预览来源",
  "关联生成 Run ID", "Seed", "共同正面提示词", "共同负面提示词", "模型", "宽度", "高度", "步数",
  "CFG", "CFG Rescale", "采样器", "噪声调度", "Seed 模式", "质量预设", "透明背景", "SMEA / Variety", "负面词预设", "质量标签启用",
];

function entryRow(row: ExportRow, project: ComparisonProject): CellValue[] {
  return [
    text(""),
    text(row.entry.name),
    text(row.entry.prompt),
    text(ratingFor(row.entry, project)),
    text(tagsFor(row.entry, project)),
    text(row.entry.note),
    text(row.entry.inPool && row.entry.kind === "single" ? "是" : "否"),
    text(`${statusFor(row)}${row.missingImage ? "；预览图无法读取" : ""}`),
    text(row.preview.source),
    ...paramsCells(row),
  ];
}

const RUN_HEADERS = [
  "生成 Run ID", "创建时间", "对象数量", "已完成", "待生成", "失败 / 待核对", "共同正面提示词", "共同负面提示词",
  "模型", "宽度", "高度", "步数", "CFG", "CFG Rescale", "采样器", "噪声调度", "Seed 模式", "实际 Seeds",
  "质量预设", "透明背景", "SMEA / Variety", "负面词预设", "质量标签启用",
];

function runRow(run: ComparisonRun): CellValue[] {
  const done = run.jobs.filter((job) => job.status === "done").length;
  const pending = run.jobs.filter((job) => job.status === "pending" || job.status === "running").length;
  const failed = run.jobs.filter((job) => ["failed", "uncertain"].includes(job.status)).length;
  const params = run.params;
  return [
    text(run.id), text(run.createdAt), number(run.jobs.length), number(done), number(pending), number(failed),
    text(run.positive), text(run.negative), text(params.model), number(params.width), number(params.height),
    number(params.steps), number(params.cfgScale), number(params.cfgRescale), text(params.sampler),
    text(params.noiseSchedule), text("fixed"), text([...new Set(run.jobs.map(job => job.seed))].join(", ")), text(params.qualityPreset),
    text(params.transparentBackground ? "是" : "否"),
    text(`${params.smea ? "SMEA" : ""}${params.smeaDyn ? " + 动态" : ""}${params.variety ? " + Variety" : ""}`),
    number(params.ucPreset), text(params.qualityToggle ? "是" : "否"),
  ];
}

function columnWidth(index: number): number {
  const widths = [24, 24, 48, 14, 24, 32, 12, 22, 32, 38, 12, 48, 48, 30, 10, 10, 10, 10, 14, 24, 18, 16, 16, 16, 20];
  return Math.min(MAX_EXCEL_COLUMN_WIDTH, widths[index] ?? 18);
}

function columnsXml(columnCount: number): string {
  const columns = Array.from({ length: columnCount }, (_, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(index)}" customWidth="1"/>`,
  ).join("");
  return `<cols>${columns}</cols>`;
}

function worksheetXml(headers: string[], rows: CellValue[][]): string {
  const header = rowXml(1, headers.map(text), 1, 24);
  const data = rows.map((values, index) => rowXml(index + 2, values, 2, 120)).join("");
  const lastRow = Math.max(1, rows.length + 1);
  const lastColumn = columnName(headers.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>` +
    columnsXml(headers.length) + `<sheetData>${header}${data}</sheetData>` +
    `<autoFilter ref="A1:${lastColumn}${lastRow}"/>` +
    `<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    `<drawing r:id="rId1"/>` +
    `</worksheet>`;
}

function runsWorksheetXml(rows: CellValue[][]): string {
  const headers = RUN_HEADERS;
  const header = rowXml(1, headers.map(text), 1, 24);
  const data = rows.map((values, index) => rowXml(index + 2, values, 2, 36)).join("");
  const lastRow = Math.max(1, rows.length + 1);
  const lastColumn = columnName(headers.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>` +
    columnsXml(headers.length) + `<sheetData>${header}${data}</sheetData>` +
    `<autoFilter ref="A1:${lastColumn}${lastRow}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5"/>` +
    `</worksheet>`;
}

function instructionsWorksheetXml(project: ComparisonProject): string {
  const rows: CellValue[][] = [
    [text("项目名称"), text(project.name)],
    [text("导出时间"), text(new Date().toISOString())],
    [text("用途"), text("本工作簿用于阅读、筛选、评级、标签与备注整理。")],
    [text("预览图"), text("预览图是从原图自动旋转后生成的等比例 JPEG 缩略图，最长边不超过 480px，质量 78；不裁切、不放大原图。")],
    [text("图片缺失"), text("没有完成图片的对象仍保留在表格中；读取失败的预览会在图状态中标明，且不会删除项目数据。")],
    [text("生成条件"), text("所有批次的共同提示词、模型、尺寸、步数、CFG、采样器与其他参数见“生成条件”工作表。")],
    [text("完整备份"), text("本文件是可读报告，不等同于完整恢复备份；如需恢复项目、所有原图、所有历史运行和内部状态，请使用“完整备份 ZIP”。")],
    [text("安全性"), text("文本均以字符串写入，不执行公式；本报告不包含 API Token、凭据或完整原图数据。")],
  ];
  const header = rowXml(1, [text("项目"), text("说明")], 1, 24);
  const data = rows.map((values, index) => rowXml(index + 2, values, 2, 36)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B${rows.length + 1}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="100" customWidth="1"/></cols>` +
    `<sheetData>${header}${data}</sheetData><autoFilter ref="A1:B${rows.length + 1}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5"/></worksheet>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="0"/><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAE2FF"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border/><border><left style="thin"><color rgb="FFD9D0EF"/></left><right style="thin"><color rgb="FFD9D0EF"/></right><top style="thin"><color rgb="FFD9D0EF"/></top><bottom style="thin"><color rgb="FFD9D0EF"/></bottom></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/>` +
    `</styleSheet>`;
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="18000" windowHeight="12000"/></bookViews><sheets>` +
    `<sheet name="画师" sheetId="1" r:id="rId1"/><sheet name="画师组合" sheetId="2" r:id="rId2"/><sheet name="生成条件" sheetId="3" r:id="rId3"/><sheet name="说明" sheetId="4" r:id="rId4"/>` +
    `</sheets></workbook>`;
}

function workbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>` +
    `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>` +
    `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function contentTypesXml(mediaCount: number): string {
  const mediaOverrides = Array.from({ length: mediaCount }, (_, index) =>
    `<Override PartName="/xl/media/image${index + 1}.jpg" ContentType="image/jpeg"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` + mediaOverrides + `</Types>`;
}

function worksheetRelationshipsXml(drawingId: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingId}.xml"/></Relationships>`;
}

function drawingRelationshipsXml(mediaNames: string[]): string {
  const relationships = mediaNames.map((mediaName, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
}

function drawingXml(rows: ExportRow[], mediaNames: string[]): string {
  const anchors: string[] = [];
  let imageIndex = 0;
  const mediaIndices = new Map(mediaNames.map((name, index) => [name, index]));
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row.mediaName || !row.previewWidth || !row.previewHeight) continue;
    const mediaIndex = mediaIndices.get(row.mediaName);
    if (mediaIndex === undefined) continue;
    const scale = Math.min(PREVIEW_FRAME_WIDTH / row.previewWidth, PREVIEW_FRAME_HEIGHT / row.previewHeight, 1);
    const width = Math.max(1, Math.round(row.previewWidth * scale));
    const height = Math.max(1, Math.round(row.previewHeight * scale));
    const fromX = 2 * PX_TO_EMU;
    const fromY = 2 * PX_TO_EMU;
    const toX = (2 + width) * PX_TO_EMU;
    const toY = (2 + height) * PX_TO_EMU;
    anchors.push(`<xdr:twoCellAnchor editAs="twoCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${fromX}</xdr:colOff><xdr:row>${rowIndex + 1}</xdr:row><xdr:rowOff>${fromY}</xdr:rowOff></xdr:from><xdr:to><xdr:col>0</xdr:col><xdr:colOff>${toX}</xdr:colOff><xdr:row>${rowIndex + 1}</xdr:row><xdr:rowOff>${toY}</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${imageIndex + 1}" name="Preview ${imageIndex + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${mediaIndex + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`);
    imageIndex += 1;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join("")}</xdr:wsDr>`;
}

function corePropertiesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>画师比较导出报告</dc:title><dc:creator>Langbai NovelAI Studio</dc:creator><cp:lastModifiedBy>Langbai NovelAI Studio</cp:lastModifiedBy></cp:coreProperties>`;
}

function appPropertiesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Langbai NovelAI Studio</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>4</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="4" baseType="lpstr"><vt:lpstr>画师</vt:lpstr><vt:lpstr>画师组合</vt:lpstr><vt:lpstr>生成条件</vt:lpstr><vt:lpstr>说明</vt:lpstr></vt:vector></TitlesOfParts></Properties>`;
}

function lazyFileStream(filePath: string): Readable {
  return Readable.from((async function* () {
    yield* fs.createReadStream(filePath);
  })());
}

async function makeThumbnail(sourcePath: string, destination: string): Promise<{ width: number; height: number }> {
  await sharp(sourcePath, { limitInputPixels: 268_000_000, pages: 1 })
    .rotate()
    .resize({ width: PREVIEW_MAX_EDGE, height: PREVIEW_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: PREVIEW_JPEG_QUALITY, chromaSubsampling: "4:2:0" })
    .toFile(destination);
  const output = await sharp(destination).metadata();
  if (!output.width || !output.height) throw new Error("Thumbnail has no dimensions.");
  return { width: output.width, height: output.height };
}

function rowsForProject(project: ComparisonProject): { singles: ExportRow[]; recipes: ExportRow[] } {
  const singles: ExportRow[] = [];
  const recipes: ExportRow[] = [];
  const index = indexRecords(project);
  for (const entry of project.entries) {
    const records = index.get(entry.id) ?? [];
    const preview = choosePreview(entry, records);
    const row: ExportRow = {
      entry,
      records,
      latest: latestRecord(records),
      selected: preview.job ? records.find((record) => record.job.id === preview.job?.id) : undefined,
      preview,
      missingImage: false,
    };
    (entry.kind === "single" ? singles : recipes).push(row);
  }
  return { singles, recipes };
}

function prepareWorkbookXml(project: ComparisonProject, singles: ExportRow[], recipes: ExportRow[], mediaNames: string[]): Record<string, string> {
  const runRows = project.runs.map(runRow);
  return {
    "[Content_Types].xml": contentTypesXml(mediaNames.length),
    "_rels/.rels": rootRelationshipsXml(),
    "xl/workbook.xml": workbookXml(),
    "xl/_rels/workbook.xml.rels": workbookRelationshipsXml(),
    "xl/styles.xml": stylesXml(),
    "xl/worksheets/sheet1.xml": worksheetXml(ENTRY_HEADERS, singles.map((row) => entryRow(row, project))),
    "xl/worksheets/sheet2.xml": worksheetXml(ENTRY_HEADERS, recipes.map((row) => entryRow(row, project))),
    "xl/worksheets/sheet3.xml": runsWorksheetXml(runRows),
    "xl/worksheets/sheet4.xml": instructionsWorksheetXml(project),
    "xl/worksheets/_rels/sheet1.xml.rels": worksheetRelationshipsXml(1),
    "xl/worksheets/_rels/sheet2.xml.rels": worksheetRelationshipsXml(2),
    "xl/worksheets/_rels/sheet3.xml.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>",
    "xl/worksheets/_rels/sheet4.xml.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>",
    "xl/drawings/drawing1.xml": drawingXml(singles, mediaNames),
    "xl/drawings/drawing2.xml": drawingXml(recipes, mediaNames),
    "xl/drawings/_rels/drawing1.xml.rels": drawingRelationshipsXml(mediaNames),
    "xl/drawings/_rels/drawing2.xml.rels": drawingRelationshipsXml(mediaNames),
    "docProps/core.xml": corePropertiesXml(),
    "docProps/app.xml": appPropertiesXml(),
  };
}

/**
 * Export a readable, filterable workbook. Original files are only read by
 * sharp; temporary JPEGs are streamed into JSZip one at a time.
 */
export async function exportSpreadsheetToFile(
  project: ComparisonProject,
  destination: string,
  resolveImage: (job: ComparisonJob) => string,
): Promise<SpreadsheetExportReport> {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "langbai-comparison-xlsx-"));
  const temporaryOutput = `${destination}.${cryptoRandomUuid()}.tmp`;
  const thumbnails = new Map<string, Thumbnail>();
  let missingImages = 0;
  let thumbnailCount = 0;

  try {
    const { singles, recipes } = rowsForProject(project);
    const allRows = [...singles, ...recipes];
    for (const row of allRows) {
      const job = row.preview.job;
      if (!job?.image) continue;
      const previewKey = `${job.image.id}:${job.image.filePath}`;
      row.previewKey = previewKey;
      const cached = thumbnails.get(previewKey);
      if (cached) {
        row.mediaName = cached.mediaName;
        row.previewWidth = cached.width;
        row.previewHeight = cached.height;
        continue;
      }
      try {
        const sourcePath = resolveImage(job);
        if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile())
          throw new Error("Image source is unavailable.");
        const mediaName = `image${thumbnailCount + 1}.jpg`;
        const thumbnailPath = path.join(temporaryDirectory, mediaName);
        const dimensions = await makeThumbnail(sourcePath, thumbnailPath);
        const thumbnail = { mediaName, filePath: thumbnailPath, ...dimensions };
        thumbnails.set(previewKey, thumbnail);
        row.mediaName = mediaName;
        row.previewWidth = dimensions.width;
        row.previewHeight = dimensions.height;
        thumbnailCount += 1;
      }
      catch {
        row.missingImage = true;
        missingImages += 1;
      }
    }

    const media = [...thumbnails.values()];
    const mediaNames = media.map((thumbnail) => thumbnail.mediaName);
    const zip = new JSZip();
    for (const [name, xml] of Object.entries(prepareWorkbookXml(project, singles, recipes, mediaNames)))
      zip.file(name, xml);
    for (const thumbnail of media)
      zip.file(`xl/media/${thumbnail.mediaName}`, lazyFileStream(thumbnail.filePath), { compression: "STORE" });

    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await pipeline(
      zip.generateNodeStream({ streamFiles: true, compression: "DEFLATE" }),
      fs.createWriteStream(temporaryOutput, { flags: "wx", mode: 0o600 }),
    );
    const bytes = (await fs.promises.stat(temporaryOutput)).size;
    await fs.promises.rename(temporaryOutput, destination);
    return { images: thumbnailCount, missingImages, bytes };
  }
  finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    await fs.promises.rm(temporaryOutput, { force: true }).catch(() => undefined);
  }
}

function cryptoRandomUuid(): string {
  // node:crypto is intentionally avoided in the public API surface; randomUUID
  // is present on every Electron/Node runtime supported by this project.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
