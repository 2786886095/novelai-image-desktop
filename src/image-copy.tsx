import {useEffect} from 'react';
import {useAppStore} from './store';

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
  const editable = (e: Element | null) => Boolean(e?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])'));
  const choose = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    selected = target?.closest<HTMLElement>('[data-image-copy-src],img') ?? null;
  };
  const copy = (event: Event) => {
    if (event.defaultPrevented || editable(doc.activeElement) || editable(event.target instanceof Element ? event.target : null) || doc.getSelection()?.toString()) return;
    const modal = [...doc.querySelectorAll<HTMLElement>('.modal-backdrop,[role="dialog"]')].filter(e=>e.getClientRects().length).at(-1);
    const visible = (e:HTMLElement|null) => e?.isConnected && e.getClientRects().length && (!modal || modal.contains(e));
    const focused = doc.activeElement?.closest<HTMLElement>('[data-image-copy-src]') ?? null;
    const candidate = visible(focused) ? focused : visible(selected) ? selected : !modal ? doc.querySelector<HTMLElement>('.canvas-area [data-image-copy-src]') : null;
    if (!candidate || !visible(candidate)) return;
    const src = candidate.dataset.imageCopySrc || (candidate instanceof HTMLImageElement ? candidate.currentSrc || candidate.src : '');
    if (!src) return;
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    busy = true;
    const state = useAppStore.getState();
    const labels: Record<string,string[]> = {'zh-CN':['已复制图片','复制图片失败'],'zh-TW':['已複製圖片','複製圖片失敗'],'ja-JP':['画像をコピーしました','画像のコピーに失敗しました'],'ko-KR':['이미지를 복사했습니다','이미지 복사 실패']};
    const text = labels[state.settings?.language ?? 'zh-CN'] ?? ['Image copied','Could not copy image'];
    void Promise.resolve().then(()=>write(src)).then(()=>state.setToast(text[0]),()=>state.setToast(text[1])).finally(()=>{busy=false;});
  };
  const key = (event: KeyboardEvent) => { if (isImageCopyShortcut(event)) copy(event); };
  doc.addEventListener('copy',copy);
  doc.addEventListener('pointerdown',choose,true);
  doc.addEventListener('keydown',key);
  const unsubscribe = useAppStore.subscribe((s,p)=>{if(s.activeTab!==p.activeTab) selected=null;});
  return ()=>{unsubscribe();doc.removeEventListener('copy',copy);doc.removeEventListener('pointerdown',choose,true);doc.removeEventListener('keydown',key);};
}

export function ImageCopySupport(){useEffect(()=>installImageCopy(),[]);return null;}
