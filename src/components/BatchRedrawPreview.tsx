import {useEffect, useRef} from 'react';
import {batchRedrawPreviewEntries, selectedBatchRedrawCandidate} from '../batch-redraw-queue';
import type {BatchRedrawItem} from '../types';
import {useAppStore} from '../store';
import {AppPortal, Button} from './ui';
import {Icon} from './icons';
import {PreviewImageViewer} from './PreviewImageViewer';

const labels: Record<string, readonly string[]> = {
  'zh-CN': ['设为主图', '已选为主图', '关闭预览', '生成结果', '原图'],
  'zh-TW': ['設為主圖', '已選為主圖', '關閉預覽', '生成結果', '原圖'],
  'en-US': ['Use as main image', 'Selected main image', 'Close preview', 'Generated outputs', 'Original images'],
  'ja-JP': ['メイン画像に設定', '選択中のメイン画像', 'プレビューを閉じる', '生成結果', '元画像'],
  'ko-KR': ['메인 이미지로 선택', '선택한 메인 이미지', '미리보기 닫기', '생성 결과', '원본 이미지'],
};

export function BatchRedrawPreview({items, url, onUrl, onSelect, onClose}: {
  items: BatchRedrawItem[];
  url: string;
  onUrl: (url: string) => void;
  onSelect: (itemId: string, candidateId: string) => void;
  onClose: () => void;
}) {
  const language = useAppStore(s => s.settings?.language);
  const text = labels[language ?? 'zh-CN'] ?? labels['en-US'];
  const entries = batchRedrawPreviewEntries(items, url);
  const index = entries.findIndex(entry => entry.url === url);
  const shown = entries[index];
  const item = shown && items.find(item => item.id === shown.itemId);
  const isMain = item && selectedBatchRedrawCandidate(item)?.id === shown.candidateId;
  const press = useRef<{x:number; y:number; background:boolean} | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); closeRef.current();}
    };
    window.addEventListener('keydown', escape, true);
    return () => {window.removeEventListener('keydown', escape, true); previous?.focus({preventScroll:true});};
  }, []);
  useEffect(() => {if (!shown) closeRef.current();}, [Boolean(shown)]);
  if (!shown) return null;
  const isControl = (target: EventTarget) => (target as Element).closest('img,button,input,.image-preview-controls');
  return <AppPortal><div className="redraw-lightbox" role="dialog" aria-modal="true" aria-label={shown.candidateId ? text[3] : text[4]}
    onPointerDownCapture={event => {press.current = {x:event.clientX, y:event.clientY, background:!isControl(event.target)};}}
    onPointerMoveCapture={event => {
      if (press.current && Math.abs(event.clientX - press.current.x) + Math.abs(event.clientY - press.current.y) > 4) press.current.background = false;
    }}
    onClick={event => {if (press.current?.background && !isControl(event.target)) onClose();}}>
    <div className="redraw-preview-content">
      <PreviewImageViewer images={entries.map(entry => ({src:entry.url, alt:entry.name}))} index={index}
        onIndex={next => onUrl(entries[next].url)} onBackgroundClick={onClose}/>
      <footer className="redraw-preview-actions">
        <span>{shown.name}</span>
        {shown.candidateId && <Button variant="primary" disabled={Boolean(isMain)}
          onClick={() => onSelect(shown.itemId, shown.candidateId!)}>{isMain ? text[1] : text[0]}</Button>}
      </footer>
    </div>
    <button type="button" className="redraw-lightbox-close" aria-label={text[2]} onClick={onClose}><Icon name="close"/></button>
  </div></AppPortal>;
}
