import {it,expect,afterEach} from 'vitest';
import {useAppStore} from '../store';
afterEach(()=>useAppStore.setState(useAppStore.getInitialState(),true));
it('baseline: progress updates retain a pending batch cancellation',()=>{const s=useAppStore.getState();s.setBatchRunning(true,{done:0,total:3});s.requestBatchCancel();s.setBatchRunning(true,{done:1,total:3});expect(useAppStore.getState().batchCancelRequested).toBe(true);});
it('baseline: reset does not discard an active batch project',()=>{const s=useAppStore.getState();s.setBatchRedraw(p=>({...p,groupName:'active-fixture'}));s.setBatchRunning(true);expect(()=>s.resetBatchRedraw()).toThrow();expect(useAppStore.getState().batchRedraw.groupName).toBe('active-fixture');expect(useAppStore.getState().batchRunning).toBe(true);});
