import {useEffect} from 'react';
import {useAppStore} from './store';
import type {CopyImageMetadataResult, NaiDesktopApi} from './types';

/** Shared Ctrl/Cmd+C dispatch. OFF uses the strongly sanitized Blob path;
 * only explicit ON may call the native original-metadata copy IPC. */
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

export function isImageCopyShortcut(event: Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'|'repeat'> & Partial<Pick<KeyboardEvent,'code'|'isComposing'>>) {
  // Function keys must never be interpreted as copy, including remapped key values.
  if (event.isComposing || /^F\d{1,2}$/i.test(event.code ?? '') || /^F\d{1,2}$/i.test(event.key)) return false;
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.repeat && event.key.toLowerCase() === 'c';
}

export async function imagePngBlob(src: string,
  sanitize = typeof window === 'undefined' ? undefined : window.naiDesktop?.preparePngForClipboard,
): Promise<Blob> {
  if (!sanitize) throw new Error('IMAGE_COPY_PRIVACY_UNAVAILABLE');
  const response = await fetch(src);
  if (!response.ok) throw new Error('IMAGE_COPY_READ_FAILED');
  const blob = await response.blob();
  if (!blob.size || blob.size > 64 * 1024 * 1024) throw new Error('IMAGE_COPY_INVALID_SIZE');
  const original = new Uint8Array(await blob.arrayBuffer());
  const pngSignature = [137,80,78,71,13,10,26,10];
  if (pngSignature.every((byte, i) => original[i] === byte)) {
    return new Blob([Uint8Array.from(await sanitize(original))], {type:'image/png'});
  }
  const bitmap = await createImageBitmap(blob);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 64 * 1024 * 1024) throw new Error('IMAGE_COPY_INVALID_DIMENSIONS');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('IMAGE_COPY_DECODE_FAILED');
    context.drawImage(bitmap,0,0);
    const png = await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('IMAGE_COPY_ENCODE_FAILED')),'image/png'));
    return new Blob([Uint8Array.from(await sanitize(new Uint8Array(await png.arrayBuffer())))], {type:'image/png'});
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
    };
    const text = labels[state.settings?.language ?? 'zh-CN'] ?? labels['zh-CN'];
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
