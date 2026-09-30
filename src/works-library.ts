import type {HistoryItem, MetadataSnapshotResult} from './types';
import {metadataSnapshotToFile} from './metadata-snapshot';
import {inspectImageMetadata, parseImageMeta} from './png-meta';

export const WORKS_PAGE_SIZE = 60;
export function worksName(path: string): string { return path.split(/[\\/]/).pop() || path; }
export function worksDirectory(path: string): string { return path.replace(/[\\/][^\\/]*$/, ''); }
export function directoryKey(path: string): string { return path.replace(/\\/g, '/').replace(/\/$/, '').toLocaleLowerCase(); }
export type WorksFilter = {query: string; date: string; group: string; directory: string; order: 'newest'|'oldest'};
export function filterWorks(items: readonly HistoryItem[], filter: WorksFilter): HistoryItem[] {
  const terms = filter.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (filter.date && item.date !== filter.date) return false;
    if (filter.group && (filter.group === '__ungrouped' ? Boolean(item.groupId) : item.groupId !== filter.group)) return false;
    if (filter.directory && directoryKey(worksDirectory(item.filePath)) !== directoryKey(filter.directory)) return false;
    const haystack = [item.filePath, item.params?.positivePrompt, item.params?.stylePrompt, item.actualSeed, item.model].join(' ').toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  }).sort((a,b) => {
    const comparison = a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    return filter.order === 'oldest' ? comparison : -comparison;
  });
}
export function selectWorksRange(ids: readonly string[], selection: ReadonlySet<string>, anchor: string|null, target: string, range: boolean): Set<string> {
  const next = new Set(selection), end = ids.indexOf(target), start = anchor ? ids.indexOf(anchor) : -1;
  if (range && start >= 0 && end >= 0) for (const id of ids.slice(Math.min(start,end),Math.max(start,end)+1)) next.add(id);
  else if (next.has(target)) next.delete(target); else next.add(target);
  return next;
}
export type WorksPrompt = {positive: string; negative: string; source: 'original'|'record'; warning?: string};
/** Snapshot reads never mutate the workbench; absent metadata is explicitly labelled as a record. */
export async function readWorksPrompt(item: HistoryItem, read: (path: string)=>Promise<MetadataSnapshotResult>): Promise<WorksPrompt> {
  const result = await read(item.filePath);
  if (!result.ok || !result.snapshot) throw new Error(result.message || 'Image file could not be read');
  const file = metadataSnapshotToFile(result.snapshot);
  const report = inspectImageMetadata(parseImageMeta(await file.arrayBuffer()));
  if (typeof report.imported.positivePrompt === 'string' && report.imported.positivePrompt.trim()) {
    return {positive: report.imported.positivePrompt, negative: report.imported.negativePrompt ?? '', source:'original', warning:report.warnings.join('\n') || undefined};
  }
  return {positive:[item.params?.stylePrompt,item.params?.positivePrompt].filter(Boolean).join(', '),negative:item.params?.negativePrompt ?? '',source:'record'};
}
