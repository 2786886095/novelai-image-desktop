import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useAppStore} from './store';
import {resolveCanvasImage} from './canvas-preview';
import {isImageCopyShortcut,imagePngBlob} from './image-copy';
const image=(id:string)=>({filePath:id+'.png',fileUrl:'https://local/'+id+'.png',width:800,height:600});
const history=(id:string)=>({...image(id),id}) as any;
beforeEach(()=>useAppStore.setState(useAppStore.getInitialState(),true));
afterEach(()=>vi.unstubAllGlobals());
it.each(['generate','postprocess'] as const)('new input replaces the canvas, not the history result in %s',async(activeTab)=>{
 const old=history('old'),next=image('pasted');
 vi.stubGlobal('window',{naiDesktop:{loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image:next})}});
 useAppStore.setState({currentImage:old,activeTab});
 await useAppStore.getState().loadWorkbenchFromPath('pasted.png');
 expect(resolveCanvasImage(useAppStore.getState())).toBe(next);
 expect(useAppStore.getState().currentImage).toBe(old);
 expect(useAppStore.getState().comparisonBeforeImage).toBeNull();
 const completed=history('completed');useAppStore.setState({currentImage:completed});
 expect(resolveCanvasImage(useAppStore.getState())).toBe(completed);
});
it('file dialog updates the same canvas and clearing input removes its preview',async()=>{
 const next=image('picked');vi.stubGlobal('window',{naiDesktop:{loadImage:vi.fn().mockResolvedValue({ok:true,image:next}),clearWorkbenchImage:vi.fn().mockResolvedValue({ok:true})}});
 await useAppStore.getState().loadWorkbenchImage();expect(resolveCanvasImage(useAppStore.getState())).toBe(next);
 await useAppStore.getState().clearWorkbenchImage();expect(resolveCanvasImage(useAppStore.getState())).toBeNull();
});
it('a delayed older paste cannot overwrite the latest image or canvas',async()=>{
 let done!:(v:any)=>void;const pending=new Promise(r=>{done=r;});const newer=image('newer');
 vi.stubGlobal('window',{naiDesktop:{loadImageFromPath:vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce({ok:true,image:newer})}});
 const first=useAppStore.getState().loadWorkbenchFromPath('older.png');await useAppStore.getState().loadWorkbenchFromPath('newer.png');
 done({ok:true,image:image('older')});await first;
 expect(resolveCanvasImage(useAppStore.getState())).toBe(newer);
});
it('silent source synchronization never steals a completed result preview',async()=>{
 const old=history('result');useAppStore.setState({currentImage:old});vi.stubGlobal('window',{naiDesktop:{loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image:image('input')})}});
 await useAppStore.getState().loadWorkbenchFromPath('input.png',{silent:true});expect(resolveCanvasImage(useAppStore.getState())).toBe(old);
});
it('supports Ctrl/Cmd+C but not other shortcuts or repeated keys',()=>{
 const key={key:'c',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,repeat:false};
 expect(isImageCopyShortcut(key)).toBe(true);expect(isImageCopyShortcut({...key,ctrlKey:false,metaKey:true,key:'C'})).toBe(true);
 for(const change of [{key:'v'},{shiftKey:true},{altKey:true},{repeat:true},{ctrlKey:false}])expect(isImageCopyShortcut({...key,...change})).toBe(false);
});
it('copies full PNG bytes without resizing and surfaces failed reads',async()=>{
 const png=new Blob(['original'],{type:'image/png'});vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>png}));expect(await imagePngBlob('image.png')).toBe(png);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));await expect(imagePngBlob('missing')).rejects.toThrow('IMAGE_COPY_READ_FAILED');
});
it('converts WebP to full-sized clipboard PNG and releases decoded resources',async()=>{
 const source=new Blob(['webp'],{type:'image/webp'}),png=new Blob(['png'],{type:'image/png'});
 const close=vi.fn(),drawImage=vi.fn();const bitmap={width:1200,height:800,close};
 const canvas={width:0,height:0,getContext:()=>({drawImage}),toBlob:(done:(blob:Blob)=>void)=>done(png)};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>source}));vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue(bitmap));vi.stubGlobal('document',{createElement:()=>canvas});
 expect(await imagePngBlob('input.webp')).toBe(png);expect([canvas.width,canvas.height]).toEqual([1200,800]);expect(drawImage).toHaveBeenCalledWith(bitmap,0,0);expect(close).toHaveBeenCalledOnce();
});
