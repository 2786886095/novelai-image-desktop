import {describe,it,expect,vi} from "vitest";
vi.mock('./store',()=>({useAppStore:{getState:()=>({setToast:vi.fn()}),subscribe:()=>()=>{}}}));
import {imageFiles,imagePasteProps} from './image-paste';
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
