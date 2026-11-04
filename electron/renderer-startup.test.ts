import {afterEach,describe,expect,it,vi} from 'vitest';
import {startupFailureText,watchRendererStartup} from './renderer-startup';
afterEach(()=>vi.useRealTimers());
describe('startup-only renderer health',()=>{
 it('reports a bounded timeout once, without automatic reload',()=>{
  vi.useFakeTimers();const onProblem=vi.fn();const guard=watchRendererStartup({onProblem,timeoutMs:100});
  vi.advanceTimersByTime(99);expect(onProblem).not.toHaveBeenCalled();vi.advanceTimersByTime(1);vi.advanceTimersByTime(1000);
  expect(onProblem.mock.calls).toEqual([['timeout']]);guard.fail('crashed');expect(onProblem).toHaveBeenCalledTimes(1);guard.dispose();
 });
 it('requires explicit retry and never intercepts a ready UI',()=>{
  vi.useFakeTimers();const onProblem=vi.fn();const guard=watchRendererStartup({onProblem,timeoutMs:100});
  guard.fail('launch-failed');expect(onProblem).toHaveBeenCalledTimes(1);expect(guard.retry()).toBe(true);
  vi.advanceTimersByTime(100);expect(onProblem.mock.calls).toEqual([['launch-failed'],['timeout']]);
  guard.ready();expect(guard.isReady()).toBe(true);expect(guard.retry()).toBe(false);guard.fail('oom');vi.runAllTimers();expect(onProblem).toHaveBeenCalledTimes(2);
 });
 it('disposal suppresses late faults and messages contain no raw error',()=>{
  vi.useFakeTimers();const onProblem=vi.fn();const guard=watchRendererStartup({onProblem,timeoutMs:100});
  guard.fail('https://synthetic.invalid/?code=SECRET');expect(onProblem.mock.calls).toEqual([['failed']]);guard.dispose();expect(guard.retry()).toBe(false);vi.runAllTimers();expect(onProblem).toHaveBeenCalledTimes(1);
 });
 for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])it('localized safe startup controls '+language,()=>{
  const row=startupFailureText(language);expect(Object.values(row).every(x=>typeof x==='string'&&x.length>0)).toBe(true);expect(row.retry).not.toBe(row.wait);
 });
});
