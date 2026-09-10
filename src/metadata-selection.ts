import type { ImageMetadataReport } from './png-meta';
import type { CharCaptionItem, ImportedParams, ModelMode } from './types';

export type MetadataApplyKey = keyof ImportedParams | 'characterCaptions' | 'referenceImages' | 'modelMode';
export type MetadataRestoreOptions = {
  preserveMissing?: boolean;
  restoreCharacters?: boolean;
  resetReferences?: boolean;
  modelMode?: ModelMode;
};
export function metadataApplyKeys(report: ImageMetadataReport): MetadataApplyKey[] {
  const keys = (Object.keys(report.imported) as (keyof ImportedParams)[]).filter(key => report.imported[key] !== undefined
    && !(key === 'seedMode' && report.imported.seed !== undefined)
    && !(key === 'qualityToggle' && report.imported.qualityPreset !== undefined));
  return report.kind === 'novelai' ? [...keys, 'characterCaptions', 'referenceImages', 'modelMode'] : keys;
}
export function selectedMetadata(report: ImageMetadataReport, selected: ReadonlySet<MetadataApplyKey>): {
  patch: ImportedParams; captions: CharCaptionItem[]; options: MetadataRestoreOptions;
} {
  const entries = Object.entries(report.imported).filter(([key]) => selected.has(key as MetadataApplyKey));
  const patch = Object.fromEntries(entries) as ImportedParams;
  if (selected.has('seed') && report.imported.seedMode !== undefined) patch.seedMode = report.imported.seedMode;
  if (selected.has('qualityPreset') && report.imported.qualityToggle !== undefined) patch.qualityToggle = report.imported.qualityToggle;
  return {
    patch,
    captions: selected.has('characterCaptions') ? report.characterCaptions : [],
    options: {
      preserveMissing: true,
      restoreCharacters: selected.has('characterCaptions'),
      resetReferences: selected.has('referenceImages'),
      ...(selected.has('modelMode') ? { modelMode: /(?:^|,\s*)fur dataset(?:\s*,|$)/i.test(report.imported.positivePrompt ?? '') ? 'furry' : 'anime' } : {}),
    },
  };
}
