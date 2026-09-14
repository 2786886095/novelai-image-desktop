import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAppStore} from './store';
import type {HistoryItem} from './types';
const item=(id:string)=>({id,filePath:`${id}.png`,fileUrl:`fixture://${id}`,params:{},date:'2026-09-14',createdAt:'2026-09-14',actualSeed:1,width:32,height:32,model:'nai-diffusion-5-full'} as HistoryItem);
beforeEach(()=>useAppStore.setState(useAppStore.getInitialState(),true));
afterEach(()=>vi.unstubAllGlobals());
it('a late delete failure must not replace a newer generated image with the deleted selection',async()=>{
  let finish!:(result:{ok:boolean})=>void;
  vi.stubGlobal('window',{naiDesktop:{deleteHistory:()=>new Promise(resolve=>{finish=resolve})}});
  const old=item('old'),next=item('new');
  useAppStore.setState({history:[old],currentImage:old,isGenerating:true});
  const pending=useAppStore.getState().deleteHistory(old.id);
  useAppStore.setState({history:[next],currentImage:next,isGenerating:false});
  finish({ok:false});expect(await pending).toBe(false);
  expect(useAppStore.getState().currentImage?.id).toBe('new');
  expect(useAppStore.getState().history.map(i=>i.id).sort()).toEqual(['new','old']);
});
it('restores the deleted selection if no later selection or generation has replaced it',async()=>{
  vi.stubGlobal('window',{naiDesktop:{deleteHistory:vi.fn().mockResolvedValue({ok:false})}});
  const old=item('old');useAppStore.setState({history:[old],currentImage:old});
  expect(await useAppStore.getState().deleteHistory(old.id)).toBe(false);
  expect(useAppStore.getState().currentImage?.id).toBe('old');
});
