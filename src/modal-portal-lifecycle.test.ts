import {afterEach,expect,it,vi} from 'vitest';
import {manageModalPortal} from './motion-system';

// Exercise the real shared lifecycle used when a modal portal or confirm dialog mounts.
// Synthetic DOM objects are not native keyboard/layout acceptance evidence.
afterEach(()=>vi.unstubAllGlobals());
it('registers a mounted active drawer, makes the workbench inert, then restores focus and prior inert state',()=>{
  const opener={isConnected:true,closest:()=>null,focus:vi.fn()};
  const root={inert:false},body={},listeners=new Map<string,unknown>();
  const doc={activeElement:opener as unknown,body,getElementById:()=>root,querySelector:()=>null,addEventListener:(type:string,callback:unknown)=>listeners.set(type,callback),removeEventListener:(type:string)=>listeners.delete(type)};
  vi.stubGlobal('document',doc);
  const host={querySelector:()=>({role:'dialog'}),querySelectorAll:()=>[],contains:()=>false} as unknown as HTMLElement;
  const release=manageModalPortal(host);
  expect(root.inert).toBe(true);expect(listeners.has('keydown')).toBe(true);
  doc.activeElement=body;release();expect(root.inert).toBe(false);expect(opener.focus).toHaveBeenCalledWith({preventScroll:true});expect(listeners.size).toBe(0);
});
it('does not unset an already-inert root or steal focus from another live surface',()=>{
  const opener={isConnected:true,closest:()=>null,focus:vi.fn()},root={inert:true},other={isConnected:true};
  const doc={activeElement:opener as unknown,body:{},getElementById:()=>root,querySelector:()=>null,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('document',doc);
  const host={querySelector:()=>({role:'dialog'}),querySelectorAll:()=>[],contains:()=>false} as unknown as HTMLElement;
  const release=manageModalPortal(host);doc.activeElement=other;release();expect(root.inert).toBe(true);expect(opener.focus).not.toHaveBeenCalled();
});
