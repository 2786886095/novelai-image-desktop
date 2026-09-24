import type { GenerateParams } from '../types';
import type { ComparisonProject, ComparisonEntry, ComparisonTag, RatingLevel, PoolRule } from './model';
export interface ComparisonState {
    version: 1;
    projects: ComparisonProject[];
    running: {
        projectId: string;
        runId: string;
        pauseRequested: boolean;
        /** Unix milliseconds when the next image may be submitted. */
        nextGenerationAt?: number;
    } | null;
}
export type ComparisonAction = {
    type: 'load';
} | {
    type: 'createProject';
} | {
    type: 'renameProject';
    projectId: string;
    name: string;
} | {
    type: 'addEntries';
    projectId: string;
    text: string;
} | {
    type: 'removeEntry';
    projectId: string;
    entryId: string;
} | {
  type: 'entry';
  projectId: string;
  entryId: string;
  runId?: string;
  patch: Partial<Pick<ComparisonEntry, 'name' | 'ratingId' | 'note' | 'inPool' | 'tagIds'>>;
} | {
  type: 'cover';
  projectId: string;
  entryId: string;
  jobId: string | null;
} | {
    type: 'setInterval';
    projectId: string;
    intervalSeconds: number;
    intervalMaxSeconds?: number;
} | {
    type: 'tags';
    projectId: string;
    tags: ComparisonTag[];
} | {
    type: 'levels';
    projectId: string;
    levels: RatingLevel[];
} | {
    type: 'replaceLevel';
    projectId: string;
    levelId: string;
    targetId: string | null;
} | {
    type: 'syncRatings';
    projectId: string;
    mapping: Record<string, string | null>;
} | {
    type: 'explore';
    projectId: string;
    rules: PoolRule[];
    count: number;
    seed: number;
} | {
    type: 'createRun';
    projectId: string;
    params: GenerateParams;
    positive: string;
    negative: string;
    seeds: number[];
    entryIds?: string[];
} | {
    type: 'quote';
    projectId: string;
    runId: string;
} | {
    type: 'start';
    projectId: string;
    runId: string;
    approvedAnlas: number;
} | {
    type: 'pause';
} | {
    type: 'retry';
    projectId: string;
    runId: string;
    jobId: string;
    acknowledgeUncertain?: boolean;
} | {
    type: 'export';
    projectId: string;
    format: 'zip' | 'csv' | 'xlsx';
} | {
    type: 'import';
};
export interface ComparisonResponse {
    ok: boolean;
    state: ComparisonState;
    message?: string;
    quote?: number;
    addedEntryIds?: string[];
}
