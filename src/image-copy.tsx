import {useEffect} from 'react';
import {useAppStore} from './store';
import type {CopyImageMetadataResult, NaiDesktopApi} from './types';

/** Shared Ctrl/Cmd+C dispatch. OFF deliberately uses the pre-existing browser
 * write/sanitization path; only explicit ON may call the optional native IPC. */
export async function copyImageForClipboard(src: string, metadataEnabled: boolean,
  nativeCopy: NaiDesktopApi['copyImageWithMetadata'], write: (src:string)=>Promise<unknown>,
): Promise<CopyImageMetadataResult | undefined> {
  if (!metadataEnabled) { await write(src); return undefined; }
  let result: CopyImageMetadataResult = {status:'unsupported'};
  try {
    if (nativeCopy) {
      const response = await nativeCopy(src);
      result = response?.status === 'copied' || response?.status === 'unsupported' || response?.status === 'failed'
        ? response : {status:'failed'};
    }
  } catch { result = {status:'failed'}; }
  if (result.status !== 'copied') await write(src);
  return result;
}

export function isImageCopyShortcut(event: Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'|'repeat'>) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.repeat && event.key.toLowerCase() === 'c';
}

export async function imagePngBlob(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) throw new Error('IMAGE_COPY_READ_FAILED');
  const blob = await response.blob();
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('IMAGE_COPY_DECODE_FAILED');
    context.drawImage(bitmap,0,0);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('IMAGE_COPY_ENCODE_FAILED')),'image/png'));
  } finally { bitmap.close(); }
}

export function installImageCopy(doc = document, write = (src:string) => navigator.clipboard.write([new ClipboardItem({'image/png': imagePngBlob(src)})])) {
  let selected: HTMLElement | null = null;
  let busy = false;
  let disposed = false;
  const editable = (e: Element | null) => Boolean(e?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])'));
  const choose = (event: Event) => {
    if (!event.isTrusted) return;
    const target = event.target instanceof Element ? event.target : null;
    selected = target?.closest<HTMLElement>('[data-image-copy-src],img') ?? null;
    // Selecting an image clears a stale text range left by number inputs.
    if (selected) doc.getSelection()?.removeAllRanges();
  };
  const copy = (event: Event) => {
    if (!event.isTrusted || disposed || event.defaultPrevented || editable(doc.activeElement) || editable(event.target instanceof Element ? event.target : null) || doc.getSelection()?.toString()) return;
    const modal = [...doc.querySelectorAll<HTMLElement>('.modal-backdrop,[role="dialog"]')].filter(e=>e.getClientRects().length).at(-1);
    const visible = (e:HTMLElement|null) => e?.isConnected && e.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"],.tab-panel-hidden') && (!modal || modal.contains(e));
    const focused = doc.activeElement?.closest<HTMLElement>('[data-image-copy-src]') ?? null;
    const candidate = visible(focused) ? focused : visible(selected) ? selected : null;
    if (!candidate || !visible(candidate)) return;
    const src = candidate.dataset.imageCopySrc || (candidate instanceof HTMLImageElement ? candidate.currentSrc || candidate.src : '');
    if (!src) return;
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    busy = true;
    const state = useAppStore.getState();
    const labels: Record<string,string[]> = {
      'zh-CN':['已复制图片','复制图片失败','已复制原始 PNG（保留元数据）','已复制图片；此来源不支持保留元数据','已复制图片；元数据保留失败'],
      'zh-TW':['已複製圖片','複製圖片失敗','已複製原始 PNG（保留中繼資料）','已複製圖片；此來源不支援保留中繼資料','已複製圖片；中繼資料保留失敗'],
      'ja-JP':['画像をコピーしました','画像のコピーに失敗しました','元の PNG をコピーしました（メタデータを保持）','画像をコピーしました。この画像のメタデータ保持には対応していません','画像をコピーしました。メタデータの保持に失敗しました'],
      'ko-KR':['이미지를 복사했습니다','이미지 복사 실패','원본 PNG를 복사했습니다 (메타데이터 유지)','이미지를 복사했습니다. 이 소스는 메타데이터 유지를 지원하지 않습니다','이미지를 복사했습니다. 메타데이터 유지에 실패했습니다'],
    };
    const text = labels[state.settings?.language ?? 'zh-CN'] ?? ['Image copied','Could not copy image','Original PNG copied (metadata preserved)','Image copied; metadata preservation unsupported for this source','Image copied; metadata preservation failed'];
    const notify = (message:string) => { if (!disposed && useAppStore.getState().activeTab === state.activeTab) state.setToast(message); };
    void Promise.resolve().then(()=>copyImageForClipboard(src, state.settings?.copyImageMetadata === true,
      typeof window === 'undefined' ? undefined : window.naiDesktop?.copyImageWithMetadata, write,
    )).then(result=>notify(text[result?.status === 'copied' ? 2 : result?.status === 'unsupported' ? 3 : result?.status === 'failed' ? 4 : 0]),()=>notify(text[1])).finally(()=>{busy=false;});
  };
  const key = (event: KeyboardEvent) => { if (isImageCopyShortcut(event)) copy(event); };
  // Only explicit Ctrl/Cmd+C on a selected image. Native copy / execCommand
  // events belong to their original text or context-menu handler.
  doc.addEventListener('pointerdown',choose,true);
  doc.addEventListener('keydown',key);
  const unsubscribe = useAppStore.subscribe((s,p)=>{if(s.activeTab!==p.activeTab) selected=null;});
  return ()=>{disposed=true;unsubscribe();doc.removeEventListener('pointerdown',choose,true);doc.removeEventListener('keydown',key);};
}

export function ImageCopySupport(){useEffect(()=>installImageCopy(),[]);return null;}
