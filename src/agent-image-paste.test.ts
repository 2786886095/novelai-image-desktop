import {expect,it,vi} from 'vitest';
vi.mock('./store',()=>({useAppStore:{getState:()=>({setToast:vi.fn()}),subscribe:()=>()=>{}}}));
import {agentComposerClipboard,installImagePasteRouter} from './image-paste';

it('imports a screenshot exposed only as a clipboard item and preserves mixed plain text',()=>{
  const shot=new File(['fixture'],'Screenshot.png',{type:'image/png'});
  const transfer={files:[],items:[{kind:'file',getAsFile:()=>shot}],getData:()=>''} as unknown as DataTransfer;
  expect(agentComposerClipboard(transfer)).toEqual({kind:'files',files:[shot]});
  expect(agentComposerClipboard({...transfer,getData:()=> 'typed text'} as unknown as DataTransfer)).toEqual({kind:'text'});
  expect(agentComposerClipboard(null)).toEqual({kind:'native'});
  console.log('DESKTOP_CLIPBOARD: screenshot item accepted, plain text preserved, native fallback');
});

it('does not stop the composer paste or read native clipboard in the global image router',()=>{
  class Composer { closest(selector:string){return selector==='[data-agent-composer-paste]'?this:null;} }
  const listeners=new Map<string,(event:any)=>void>();
  vi.stubGlobal('Element',Composer);
  vi.stubGlobal('document',{addEventListener:(type:string,fn:any)=>listeners.set(type,fn),removeEventListener:vi.fn()});
  const native=vi.fn();
  vi.stubGlobal('window',{naiDesktop:{readClipboardImageFiles:native}});
  try{
    const remove=installImagePasteRouter();
    for(const files of [[],[new File(['fixture'],'shot.png',{type:'image/png'})]]){
      const preventDefault=vi.fn(),stopImmediatePropagation=vi.fn();
      listeners.get('paste')!({target:new Composer(),clipboardData:{files,getData:()=>''},preventDefault,stopImmediatePropagation});
      expect(preventDefault).not.toHaveBeenCalled();
      expect(stopImmediatePropagation).not.toHaveBeenCalled();
    }
    expect(native).not.toHaveBeenCalled();
    remove();
  }finally{vi.unstubAllGlobals();}
});
