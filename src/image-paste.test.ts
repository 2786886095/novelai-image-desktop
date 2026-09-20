import {readFileSync} from "node:fs";
import {describe,it,expect,vi} from "vitest";
vi.mock('./store',()=>({useAppStore:{getState:()=>({setToast:vi.fn()}),subscribe:()=>()=>{}}}));
import {imageFiles,imagePasteProps,prefersTextPaste} from './image-paste';
describe('image paste contract',()=>{
  it('leaves ordinary text alone and recognizes WebP without a MIME type',()=>{
    expect(imageFiles(null)).toEqual([]);
    const files=[new File(['fixture'],'photo.WEBP'),new File(['text'],'note.txt',{type:'text/plain'}),new File(['fixture'],'shot.png',{type:'image/png'})];
    expect(imageFiles({files} as unknown as DataTransfer).map(f=>f.name)).toEqual(['photo.WEBP','shot.png']);
  });
  it('one chosen target receives the pasted paths once',()=>{
    const called=vi.fn(),a=imagePasteProps(called,true),other=vi.fn(); imagePasteProps(other);
    const event={clipboardData:{files:[{path:'F:/local/fixture.webp',type:'image/webp'}]},preventDefault:vi.fn(),stopPropagation:vi.fn()};
    a.onPaste(event as any);expect(called).toHaveBeenCalledWith(['F:/local/fixture.webp']);expect(other).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);expect(a['data-image-paste-multiple']).toBe('true');
  });
});

it('keeps paste target routing without painting a persistent outline',()=>{
  const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
  const router=readFileSync(new URL('./image-paste.tsx',import.meta.url),'utf8');
  expect(css).not.toContain('[data-image-paste-active=');
  expect(router).toContain("selected = target");
  expect(router).toContain("document.addEventListener('paste',paste,true)");
});


it('keeps Excel text in an editor even when the clipboard also has a PNG preview', () => {
  const OriginalElement = globalThis.Element;
  class FakeElement { constructor(private editor: boolean) {} closest() { return this.editor ? this : null; } }
  vi.stubGlobal('Element', FakeElement);
  try {
    const transfer = { getData: (type: string) => type === 'text/plain' ? 'artist_one\nartist_two' : '', files: [new File(['preview'], 'excel.png', { type: 'image/png' })] } as unknown as DataTransfer;
    expect(imageFiles(transfer)).toHaveLength(1);
    expect(prefersTextPaste(new FakeElement(true) as unknown as EventTarget, transfer)).toBe(true);
    expect(prefersTextPaste(new FakeElement(false) as unknown as EventTarget, transfer)).toBe(false);
    expect(prefersTextPaste(new FakeElement(true) as unknown as EventTarget, { getData: () => '' } as unknown as DataTransfer)).toBe(false);
  } finally { vi.stubGlobal('Element', OriginalElement); }
});
