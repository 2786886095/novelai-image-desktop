import type {HistoryItem, WorkingImage} from './types';

export type InputPreviewAnchor = {result: HistoryItem | null};

/** A new input wins until a different result/history selection takes over. */
export function resolveCanvasImage(state: {
  currentImage: HistoryItem | null;
  workbenchImage: WorkingImage | null;
  inputPreviewAnchor: InputPreviewAnchor | null;
}) {
  return state.workbenchImage && state.inputPreviewAnchor?.result === state.currentImage
    ? state.workbenchImage : state.currentImage;
}
