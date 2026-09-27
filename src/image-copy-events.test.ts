import {it,expect,vi,afterEach,beforeEach} from "vitest";
import {installImageCopy} from "./image-copy";
import {useAppStore} from "./store";
class ElementFixture {
 isConnected=true; dataset={imageCopySrc:"fixture.png"}; hidden=false; editable=false;
 closest(selector:string):any {if(selector.includes('input,'))return this.editable?this:null;if(selector.includes('[hidden]'))return this.hidden?this:null;return this;}
 getClientRects(){return [1];}
}
beforeEach(()=>{useAppStore.setState(useAppStore.getInitialState(),true);vi.stubGlobal('Element',ElementFixture);vi.stubGlobal('HTMLImageElement',ElementFixture);});
afterEach(()=>vi.unstubAllGlobals());
function fixture(){
 const listeners=new Map<string,Function>();const selected=new ElementFixture();const write=vi.fn().mockResolvedValue(undefined);
 const doc={activeElement:null,getSelection:()=>null,querySelectorAll:()=>[],addEventListener:(name:string,fn:Function)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)};
 const dispose=installImageCopy(doc as any,write);
 const key=(isTrusted=true)=>listeners.get('keydown')?.({isTrusted,key:'c',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,repeat:false,defaultPrevented:false,target:null,preventDefault:vi.fn(),stopPropagation:vi.fn()});
 const choose=()=>listeners.get('pointerdown')?.({target:selected,isTrusted:true});return{listeners,selected,write,doc,dispose,key,choose};
}
it('does not register global copy interception or guess a canvas when no image was selected',async()=>{
 const f=fixture();expect(f.listeners.has('copy')).toBe(false);f.key();await Promise.resolve();expect(f.write).not.toHaveBeenCalled();f.dispose();
});
it('only copies a visible explicitly selected image on a trusted shortcut',async()=>{
 const f=fixture();f.choose();f.key(false);await Promise.resolve();expect(f.write).not.toHaveBeenCalled();f.key();await new Promise(r=>setTimeout(r,0));expect(f.write).toHaveBeenCalledExactlyOnceWith('fixture.png');expect(useAppStore.getState().toast).toBe('已复制图片');f.dispose();
});
it('ignores hidden, editable and tab-stale selections',async()=>{
 const f=fixture();f.choose();f.selected.hidden=true;f.key();f.selected.hidden=false;f.doc.activeElement=Object.assign(new ElementFixture(),{editable:true}) as any;f.key();f.doc.activeElement=null;useAppStore.setState({activeTab:'records'});f.key();await Promise.resolve();expect(f.write).not.toHaveBeenCalled();f.dispose();
});
it('does not notify after the original page is left or the handler is disposed',async()=>{
 const f=fixture();let complete!:()=>void;f.write.mockImplementation(()=>new Promise<void>(r=>complete=r));f.choose();f.key();await Promise.resolve();f.dispose();complete();await new Promise(r=>setTimeout(r,0));expect(useAppStore.getState().toast).toBe('');
});
