import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useAppStore} from './store';
import type {HistoryItem} from './types';

function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function item(date:string,groupId?:string):HistoryItem {
  return {id:`${date}-${groupId??'none'}`,date,filePath:`fixture/${date}.png`,fileUrl:`fixture://${date}`,createdAt:`${date}T12:00:00Z`,width:1,height:1,model:'nai-diffusion-4-5-full',actualSeed:1,params:{} as HistoryItem['params'],groupId};
}
function bridge(overrides:Record<string,unknown>={}) {
  const api={getHistoryDates:vi.fn(async()=>['2026-10-31','2026-10-30']),getHistoryGroups:vi.fn(async()=>[]),getHistory:vi.fn(async(date?:string,group?:string)=>[item(date??'2026-10-31',group)]),setSetting:vi.fn(async()=>undefined),...overrides};
  vi.stubGlobal('window',{naiDesktop:api});return api;
}
beforeEach(()=>{useAppStore.setState(useAppStore.getInitialState(),true);useAppStore.setState({historyDates:['2026-10-31','2026-10-30'],selectedDate:'2026-10-30',history:[item('2026-10-30')]});});
afterEach(()=>vi.unstubAllGlobals());

describe('history latest-read ordering (#79 date-selector regression)',()=>{
  it('retains normal serial refresh and October31 selection',async()=>{
    bridge();await useAppStore.getState().refreshHistory('2026-10-30');await useAppStore.getState().refreshHistory('2026-10-31');
    expect(useAppStore.getState().historyDates).toContain('2026-10-31');expect(useAppStore.getState().selectedDate).toBe('2026-10-31');
  });
  it('ignores an old dates/groups response after a newer refresh completed',async()=>{
    const old=deferred<string[]>();let calls=0;
    bridge({getHistoryDates:vi.fn(()=>++calls===1?old.promise:Promise.resolve(['2026-10-31','2026-10-30']))});
    const stale=useAppStore.getState().refreshHistory('2026-10-30');await useAppStore.getState().refreshHistory('2026-10-31');old.resolve(['2026-10-30']);await stale;
    expect(useAppStore.getState().historyDates).toContain('2026-10-31');expect(useAppStore.getState().selectedDate).toBe('2026-10-31');expect(useAppStore.getState().history.map(h=>h.date)).toEqual(['2026-10-31']);
  });
  it('ignores an old rows response after the second await',async()=>{
    const rows=deferred<HistoryItem[]>();const started=deferred<void>();let calls=0;
    bridge({getHistory:vi.fn(()=>{if(++calls===1){started.resolve();return rows.promise;}return Promise.resolve([item('2026-10-31')]);})});
    const stale=useAppStore.getState().refreshHistory('2026-10-30');await started.promise;await useAppStore.getState().refreshHistory('2026-10-31');rows.resolve([item('2026-10-30')]);await stale;
    expect(useAppStore.getState().selectedDate).toBe('2026-10-31');expect(useAppStore.getState().history.map(h=>h.date)).toEqual(['2026-10-31']);
  });
  it('does not replace a newer explicit date selection with a pending refresh',async()=>{
    const old=deferred<string[]>();bridge({getHistoryDates:vi.fn(()=>old.promise)});
    const stale=useAppStore.getState().refreshHistory('2026-10-30');await useAppStore.getState().setSelectedDate('2026-10-31');old.resolve(['2026-10-30']);await stale;
    expect(useAppStore.getState().selectedDate).toBe('2026-10-31');expect(useAppStore.getState().historyDates).toContain('2026-10-31');expect(useAppStore.getState().history[0].date).toBe('2026-10-31');
  });
  it('does not replace a newer group selection with a pending refresh',async()=>{
    const old=deferred<string[]>();bridge({getHistoryDates:vi.fn(()=>old.promise)});
    const stale=useAppStore.getState().refreshHistory('2026-10-30');await useAppStore.getState().setSelectedGroupId('new-group');old.resolve(['2026-10-30']);await stale;
    expect(useAppStore.getState().selectedGroupId).toBe('new-group');expect(useAppStore.getState().historyDates).toContain('2026-10-31');expect(useAppStore.getState().history[0].groupId).toBe('new-group');
  });
  it('keeps the latest date when two selection requests resolve in reverse order',async()=>{
    const old=deferred<HistoryItem[]>();let calls=0;bridge({getHistory:vi.fn(()=>++calls===1?old.promise:Promise.resolve([item('2026-10-31')]))});
    const stale=useAppStore.getState().setSelectedDate('2026-10-30');await useAppStore.getState().setSelectedDate('2026-10-31');old.resolve([item('2026-10-30')]);await stale;
    expect(useAppStore.getState().selectedDate).toBe('2026-10-31');expect(useAppStore.getState().currentImage?.date).toBe('2026-10-31');
  });
  it('keeps the latest group when old rows finish after a new selection',async()=>{
    const old=deferred<HistoryItem[]>();const started=deferred<void>();let calls=0;
    bridge({getHistory:vi.fn(()=>{if(++calls===1){started.resolve();return old.promise;}return Promise.resolve([item('2026-10-30','new-group')]);})});
    const stale=useAppStore.getState().setSelectedGroupId('old-group');await started.promise;await useAppStore.getState().setSelectedGroupId('new-group');old.resolve([item('2026-10-30','old-group')]);await stale;
    expect(useAppStore.getState().selectedGroupId).toBe('new-group');expect(useAppStore.getState().history[0].groupId).toBe('new-group');
  });
  it('does not start old group rows after a newer setting request completed',async()=>{
    const old=deferred<void>();let calls=0;
    const api=bridge({setSetting:vi.fn(()=>++calls===1?old.promise:Promise.resolve())});
    const stale=useAppStore.getState().setSelectedGroupId('old-group');await useAppStore.getState().setSelectedGroupId('new-group');old.resolve();await stale;
    expect(useAppStore.getState().selectedGroupId).toBe('new-group');expect(api.getHistory).toHaveBeenCalledTimes(1);expect(api.getHistory).toHaveBeenCalledWith('2026-10-30','new-group');
  });
});
