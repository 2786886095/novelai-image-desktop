import { useEffect } from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { useAppStore } from "./store";
import { normalizeAppLanguage } from "./i18n";
import { droppedImagePaths } from "./drag-drop";

const labels = {
  "zh-CN": ["请先点击要添加图片的区域，再按 Ctrl+V", "正在读取剪贴板图片…", "图片已交给所选区域", "粘贴图片失败，请检查图片格式和大小", "剪贴板中没有图片", "多张图片请粘贴到支持批量导入的区域"],
  "zh-TW": ["請先點擊要加入圖片的區域，再按 Ctrl+V", "正在讀取剪貼簿圖片…", "圖片已交給所選區域", "貼上圖片失敗，請檢查格式和大小", "剪貼簿中沒有圖片", "多張圖片請貼到支援批次匯入的區域"],
  "en-US": ["Select an image input area, then press Ctrl+V", "Reading clipboard images…", "Image sent to the selected area", "Could not paste image; check its format and size", "No image on the clipboard", "Choose a batch image input for multiple images"],
  "ja-JP": ["画像入力欄を選択して Ctrl+V を押してください", "クリップボード画像を読込中…", "選択した入力欄に画像を渡しました", "画像の形式とサイズを確認してください", "クリップボードに画像がありません", "複数画像は一括入力欄に貼り付けてください"],
  "ko-KR": ["이미지 입력 영역을 선택한 뒤 Ctrl+V를 누르세요", "클립보드 이미지 읽는 중…", "선택 영역에 이미지를 전달했습니다", "이미지 형식과 크기를 확인하세요", "클립보드에 이미지가 없습니다", "여러 이미지는 일괄 입력 영역에 붙여 넣으세요"],
};
function notify(index: number) {
  const state = useAppStore.getState();
  state.setToast(labels[normalizeAppLanguage(state.settings?.language)][index]);
}

/** For image pickers backed by a main-process file dialog. */
export function imagePasteProps(onPaths: (paths: string[]) => void | Promise<void>, multiple = false) {
  return {
    "data-image-paste": "event",
    "data-image-paste-multiple": multiple ? "true" : "false",
    tabIndex: 0,
    onPaste: (event: ReactClipboardEvent<HTMLElement>) => {
      const paths = droppedImagePaths(event.clipboardData);
      if (!paths.length) return;
      event.preventDefault(); event.stopPropagation();
      try { Promise.resolve(onPaths(paths)).catch(() => notify(3)); }
      catch { notify(3); }
    },
  } as const;
}

type Target = { element: HTMLElement; input?: HTMLInputElement };
function imageMime(name: string) {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return ({jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',png:'image/png'} as Record<string,string>)[extension] ?? 'image/png';
}
export function imageFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  const files = Array.from(transfer.files ?? []);
  if (!files.length) for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind === "file") { const file = item.getAsFile(); if (file) files.push(file); }
  }
  return files.filter(file => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name));
}
export function targetAvailable(target: Target | null): target is Target {
  if (!target || !target.element.isConnected || !target.element.getClientRects().length || target.element.closest('[hidden],[aria-hidden="true"]')) return false;
  if (target.input?.disabled || target.element.matches(':disabled,[aria-disabled="true"]')) return false;
  const modal = Array.from(document.querySelectorAll<HTMLElement>('.modal-backdrop,[role="dialog"]')).filter(e=>e.getClientRects().length).at(-1);
  return !modal || modal.contains(target.element);
}
function findTarget(start: EventTarget | null): Target | null {
  if (!(start instanceof Element)) return null;
  const declared = start.closest<HTMLElement>('[data-image-paste]');
  // A more specific file input beats an outer drop zone.
  let current: Element | null = start;
  while (current) {
    const inputs: HTMLInputElement[] = current.matches('input[type="file"]') ? [current as HTMLInputElement] : Array.from(current.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(i=>/image\/|\.png|\.webp|\.jpg/i.test(i.accept));
    if (inputs.length === 1 && (inputs[0].parentElement === current || inputs[0].closest("label") === current || current.hasAttribute("data-image-input-area")) && /image\/|\.png|\.webp|\.jpg/i.test(inputs[0].accept)) {
      const element = inputs[0].closest<HTMLElement>('label,[data-image-input-area]') ?? current as HTMLElement;
      return {element,input:inputs[0]};
    }
    if (current === declared || current.matches('main,form,.modal,body')) break;
    current = current.parentElement;
  }
  return declared ? {element:declared} : null;
}

/** One router owns paste. No background clipboard polling and no global target
 * default: a newly opened page/dialog must receive a real click/focus first. */
export function installImagePasteRouter() {
  let selected: Target | null = null;
  let busy = false, revision = 0, lastPaste = 0;
  const synthetic = new WeakSet<Event>();
  const choose = (event: Event) => {
    const target = findTarget(event.target);
    if (target && targetAvailable(target)) {
      selected?.element.removeAttribute('data-image-paste-active');
      selected = target; selected.element.setAttribute('data-image-paste-active','true'); revision++;
    } else if (target) {
      selected?.element.removeAttribute('data-image-paste-active');
      selected = null; revision++;
    }
  };
  const apply = async (files: File[], target: Target | null, version: number) => {
    if (!files.length || version !== revision) return;
    if (!targetAvailable(target)) { notify(0); return; }
    if (busy) return;
    const multiple = target.input?.multiple || target.element.dataset.imagePasteMultiple === 'true';
    if (files.length > 1 && !multiple) { notify(5); return; }
    busy = true; notify(1);
    try {
      if (files.length > 16 || files.some(f=>f.size>32*1024*1024) || files.reduce((n,f)=>n+f.size,0)>64*1024*1024) throw new Error('Clipboard size limit');
      const paths = await window.naiDesktop.savePastedImageFiles(await Promise.all(files.map(async file=>({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())}))));
      if (version !== revision || !targetAvailable(target)) return;
      const transfer = new DataTransfer();
      files.forEach((input,i)=>{const file = input.type ? input : new File([input],input.name,{type:imageMime(input.name)});Object.defineProperty(file,'path',{value:paths[i],configurable:true});transfer.items.add(file);});
      if (target.input) {
        target.input.files = transfer.files;
        target.input.dispatchEvent(new Event('change',{bubbles:true}));
      } else if (target.element.dataset.imagePaste === 'drop') {
        target.element.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
      } else {
        const event = new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer});
        synthetic.add(event); target.element.dispatchEvent(event);
      }
      notify(2);
    } catch { notify(3); }
    finally { busy = false; }
  };
  const nativePaste = async (target: Target | null, version: number) => {
    try {
      const images = await window.naiDesktop.readClipboardImageFiles();
      const files = images.map(item=>new File([new Uint8Array(item.bytes)],item.name,{type:imageMime(item.name)}));
      await apply(files,target,version);
    } catch { notify(3); }
  };
  const paste = (event: ClipboardEvent) => {
    if (synthetic.has(event)) return;
    lastPaste++;
    const files = imageFiles(event.clipboardData);
    if (files.length) { event.preventDefault(); event.stopImmediatePropagation(); void apply(files,selected,revision); }
    else if (!event.clipboardData?.getData('text/plain')) void nativePaste(selected,revision);
  };
  const key = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'v' || event.repeat) return;
    const before = lastPaste, target = selected, version = revision;
    // Non-editable controls may not receive a browser paste event.
    window.setTimeout(()=>{if (lastPaste === before) void nativePaste(target,version);},100);
  };
  const unsubscribe = useAppStore.subscribe((state,previous)=>{
    if (state.activeTab !== previous.activeTab) { selected?.element.removeAttribute('data-image-paste-active'); selected=null; revision++; }
  });
  document.addEventListener('pointerdown',choose,true); document.addEventListener('focusin',choose,true);
  document.addEventListener('paste',paste,true); document.addEventListener('keydown',key,true);
  return () => { unsubscribe(); revision++; selected?.element.removeAttribute('data-image-paste-active'); document.removeEventListener('pointerdown',choose,true); document.removeEventListener('focusin',choose,true); document.removeEventListener('paste',paste,true); document.removeEventListener('keydown',key,true); };
}

export function ImagePasteSupport() { useEffect(installImagePasteRouter,[]); return null; }
