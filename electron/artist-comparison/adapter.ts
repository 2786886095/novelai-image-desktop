import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { exportSpreadsheetToFile } from './spreadsheet';
import { ComparisonService } from './service';
import { readProjects, writeProjects, exportArchiveToFile, importArchive, csvReport, MAX_ARCHIVE_BYTES } from './files';
import { generateImage, quoteAnlasCost, refreshStoredAccount, sanitizeGroupFolderName } from '../ipc/nai';
import { ensureHistoryGroup, getHistory } from '../ipc/store';
import { toLocalMediaUrl } from '../ipc/local-media-protocol';
import { reserveGeneration, type GenerationReservation } from '../ipc/job-registry';
import type { ComparisonRun, ComparisonJob } from '../../src/artist-comparison/model';
import type { ComparisonAction } from '../../src/artist-comparison/protocol';
function requestParams(run: ComparisonRun, job: ComparisonJob) {
    const entry = run.entries.find(e => e.id === job.entryId);
    if (!entry)
        throw new Error('Missing comparison entry.');
    return {
        ...run.params, metadataReplay: undefined, preservePromptText: true,
        positivePrompt: [run.positive.trim(), entry.prompt.trim()].filter(Boolean).join(', '),
        stylePrompt: '', negativePrompt: run.negative, seed: job.seed, seedMode: 'fixed' as const,
        fileNamePrefix: `comparison-${job.id}`,
    };
}
let service: ComparisonService | undefined;
function getService() {
    if (service)
        return service;
    const root = path.join(app.getPath('userData'), 'artist-comparison');
    const file = path.join(root, 'projects.v1.json'), assets = path.join(root, 'images');
    let reservation: GenerationReservation | undefined;
    service = new ComparisonService({
        read: () => {
            const projects = readProjects(file);
            const history = new Map(getHistory().map(h => [h.id, h]));
            for (const p of projects)
                for (const r of p.runs)
                    for (const j of r.jobs) {
                        if (!j.image)
                            continue;
                        const known = history.get(j.image.id);
                        if (known && known.filePath === j.image.filePath)
                            j.image.fileUrl = known.fileUrl;
                        else if (fs.existsSync(j.image.filePath) && fs.existsSync(assets) && path.dirname(fs.realpathSync(j.image.filePath)) === fs.realpathSync(assets))
                            j.image.fileUrl = toLocalMediaUrl(j.image.filePath);
                        else
                            j.image.fileUrl = '';
                    }
            return projects;
        }, write: projects => writeProjects(file, projects),
        acquire: () => { reservation = reserveGeneration('artist-comparison'); return () => { reservation?.release(); reservation = undefined; }; },
        quote: async (run, job) => {
            const account = await refreshStoredAccount();
            const quote = await quoteAnlasCost({ feature: 'generate', params: requestParams(run, job), batchCount: 1, account, extras: { vibeImages: [], charCaptions: [] } });
            if (!quote.ok || typeof quote.amount !== 'number')
                throw new Error(quote.message ?? 'Could not read generation price.');
            if (typeof account.anlasBalance === 'number' && quote.amount > account.anlasBalance)
                throw new Error('Insufficient Anlas.');
            return quote.amount;
        },
        generate: async (project, run, job) => {
            if (!reservation)
                throw new Error('Generation reservation lost.');
            const account = await refreshStoredAccount();
            const group = ensureHistoryGroup(project.name, `comparison-${project.id}`);
            const result = await reservation.run(() => generateImage(requestParams(run, job), { vibeImages: [], charCaptions: [] }, { groupOverride: { groupId: group.id, folderName: sanitizeGroupFolderName(group.name) } }));
            const item = result.items[0];
            if (!item)
                return { error: result.message, uncertain: !['auth', 'validation', 'reference'].includes(result.failureKind ?? '') };
            let actualAnlas: number | undefined;
            try {
                const after = await refreshStoredAccount();
                if (typeof account.anlasBalance === 'number' && typeof after.anlasBalance === 'number')
                    actualAnlas = Math.max(0, account.anlasBalance - after.anlasBalance);
            }
            catch { /* Image success survives account refresh failure. */ }
            return { image: { id: item.id, filePath: item.filePath, fileUrl: item.fileUrl }, actualAnlas };
        },
        recover: job => {
            const item = getHistory().find(h => h.params.fileNamePrefix === `comparison-${job.id}` && fs.existsSync(h.filePath));
            return item ? { id: item.id, filePath: item.filePath, fileUrl: item.fileUrl } : undefined;
        },
        exportProject: async (project, format) => {
            if (!['zip', 'csv', 'xlsx'].includes(format)) throw new Error('Unsupported export format.');
            const reportName = `${project.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) || 'artist-comparison'}-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
            const result = await dialog.showSaveDialog({ title: 'Export artist comparison', defaultPath: format === 'xlsx' ? reportName : `artist-comparison.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
            if (result.canceled || !result.filePath)
                return 'Export cancelled.';
            if (format === 'csv')
                fs.writeFileSync(result.filePath, csvReport(project));
            else {
                const history = new Map(getHistory().map(item => [item.id, item]));
                const resolveImage = (job: ComparisonJob) => {
                    const img = job.image!;
                    const item = history.get(img.id);
                    const known = item && path.resolve(item.filePath) === path.resolve(img.filePath);
                    const resolved = fs.realpathSync(img.filePath);
                    const imported = fs.existsSync(assets) && path.dirname(resolved) === fs.realpathSync(assets) && /^[a-f0-9]{64}\.png$/.test(path.basename(resolved));
                    if (!known && !imported)
                        throw new Error('Output is not a known comparison image.');
                    if (fs.statSync(resolved).size > 64 * 1024 * 1024)
                        throw new Error('Image exceeds export limit.');
                    return resolved;
                };
                if (format === 'xlsx') {
                    const report = await exportSpreadsheetToFile(project, result.filePath, resolveImage);
                    return `Excel 导出完成：${report.images} 张等比例预览图，${(report.bytes / 1024 / 1024).toFixed(1)} MB。${report.missingImages ? ` ${report.missingImages} 张图片无法读取，已在表格中标注。` : ''}`;
                }
                await exportArchiveToFile(project, result.filePath, resolveImage);
            }
            return 'Export complete.';
        },
        importProject: async () => {
            const result = await dialog.showOpenDialog({ title: 'Import artist comparison', filters: [{ name: 'Comparison ZIP', extensions: ['zip'] }], properties: ['openFile'] });
            if (result.canceled || !result.filePaths[0])
                return null;
            const selected = result.filePaths[0];
            if ((await fs.promises.stat(selected)).size > MAX_ARCHIVE_BYTES)
                throw new Error('Archive exceeds 2 GiB.');
            return importArchive(await fs.promises.readFile(selected), assets, toLocalMediaUrl);
        },
    });
    return service;
}
export async function comparisonAction(action: ComparisonAction) { return getService().dispatch(action); }
