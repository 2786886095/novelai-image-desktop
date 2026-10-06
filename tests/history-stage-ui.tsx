import React from 'react';
import {createRoot} from 'react-dom/client';
import {ImageCanvas} from '../src/App';
import {useAppStore} from '../src/store';
import type {HistoryItem, WorkingImage} from '../src/types';
import '../src/styles.css';
import '../src/layout-motion.css';

const imageUrl = (width: number, height: number, color: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`);
const history = [[900, 300, 'orange'], [300, 900, 'purple'], [600, 600, 'green']].map(([width, height, color], i) => ({
  id: 'history-' + i, filePath: 'F:/materials/history-' + i + '.png', fileUrl: imageUrl(Number(width), Number(height), String(color)),
  width: Number(width), height: Number(height), date: '2026-10-06', createdAt: '2026-10-06T00:00:00Z', params: {}, actualSeed: 1, model: 'fixture', feature: i === 1 ? 'material' : 'generate',
})) as HistoryItem[];
const calls: string[] = [];
const workingImage = (item: HistoryItem): WorkingImage => ({filePath: item.filePath, fileUrl: item.fileUrl, width: item.width, height: item.height});
window.naiDesktop = {
  favoritesStatus: async () => null,
  onFavoritesChanged: () => () => {},
  loadImageFromPath: async (filePath: string) => {calls.push(filePath); const item = history.find(item => item.filePath === filePath); return item ? {ok: true, image: workingImage(item)} : {ok: false};},
  startImageDrag: (src: string) => calls.push('drag:' + src),
} as any;
function reset() {
  useAppStore.setState({history: [...history], currentImage: history[1], workbenchImage: {...workingImage(history[1]), filePath: 'f:\\MATERIALS\\history-1.png'}, inputPreviewAnchor: {result: history[1]}, activeTab: 'generate', comparisonBeforeImage: null, isGenerating: false, generationPreview: null, settings: {language: 'en-US', superDrop: false} as any});
  calls.length = 0;
}
reset();
(window as any).issueUI = {history, calls, reset, state: () => useAppStore.getState(), setHistory: (items: HistoryItem[]) => useAppStore.setState({history: items})};
createRoot(document.getElementById('root')!).render(<>
  <textarea aria-label="Unrelated prompt" defaultValue="Textarea arrow keys must stay here"/>
  <div className="persistent-canvas-surface is-active issue-image-canvas" style={{position: 'relative', height: 680, width: 1000}}><ImageCanvas/></div>
  <style>{`.issue-image-canvas>.canvas-area{height:100%;min-height:0} .zoom-frame{transition:none}`}</style>
</>);
