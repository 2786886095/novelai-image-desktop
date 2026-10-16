import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useAppStore} from './store';
const previous={namePrompt:'OLD_NAME',featurePrompt:'OLD_FEATURE'};
function setup(){
 let resolve!:(reply:any)=>void,reject!:(error:Error)=>void;
 const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no});
 const history=vi.fn().mockResolvedValue({ok:true});
 vi.stubGlobal('window',{naiDesktop:{convertPrompt:()=>promise,addConvertHistoryItem:history}});
 return{resolve,reject,history};
}
describe('conversion retains the last usable result',()=>{
 beforeEach(()=>{vi.useFakeTimers();useAppStore.setState(useAppStore.getInitialState(),true);useAppStore.setState({convertInput:'synthetic request',convertMode:'natural',convertKnownCharacter:true,convertResult:'OLD_RESULT',convertResultVariants:previous});});
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
 it.each(['HTTP 401','invalid JSON','refusal'])('keeps variants during and after %s',(message)=>{
  const request=setup(),running=useAppStore.getState().runConvertPrompt();
  expect(useAppStore.getState().convertResultVariants).toEqual(previous);request.resolve({ok:false,message});
  return running.then(()=>{const s=useAppStore.getState();expect(s.convertResult).toBe('OLD_RESULT');expect(s.convertResultVariants).toEqual(previous);expect(s.convertJobs[0].status).toBe('failed');expect(request.history).not.toHaveBeenCalled();});
 });
 it('keeps variants after rejected IPC',async()=>{const r=setup(),running=useAppStore.getState().runConvertPrompt();r.reject(Error('synthetic offline'));await running;expect(useAppStore.getState().convertResultVariants).toEqual(previous);expect(r.history).not.toHaveBeenCalled();});
 it('ignores a canceled response',async()=>{const r=setup(),running=useAppStore.getState().runConvertPrompt();useAppStore.getState().removeConvertJob(useAppStore.getState().convertJobs[0].id);r.resolve({ok:true,result:'CANCELED'});await running;expect(useAppStore.getState().convertResult).toBe('OLD_RESULT');expect(useAppStore.getState().convertResultVariants).toEqual(previous);expect(r.history).not.toHaveBeenCalled();});
 it('replaces variants and writes history only on success',async()=>{const r=setup(),running=useAppStore.getState().runConvertPrompt(),next={namePrompt:'NEW_NAME',featurePrompt:'NEW_FEATURE'};r.resolve({ok:true,result:'NEW_RESULT',variants:next});await running;expect(useAppStore.getState().convertResult).toBe('NEW_RESULT');expect(useAppStore.getState().convertResultVariants).toEqual(next);expect(r.history).toHaveBeenCalledTimes(1);});
});
