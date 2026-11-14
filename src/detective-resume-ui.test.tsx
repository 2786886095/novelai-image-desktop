import {beforeEach, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const fixture=vi.hoisted(()=>({index:0,progress:{} as Record<string,unknown>,recovery:{supported:true,manifestSha256:'a'.repeat(64),pendingRequestHash:'b'.repeat(64),requiresPaidReplayConfirmation:true,message:''} as any}));
vi.mock('react',async original=>{const React=await original<typeof import('react')>();return {...React,useState:(initial:unknown)=>{const n=fixture.index++;if(n===2)return [{ready:true,runtimeValidation:{state:'passed'},running:false,stage:'paused',completed:137,budget:300,directory:'owned-run',recovery:fixture.recovery,candidates:[],...fixture.progress},()=>{}];return React.useState(initial);}};});
vi.mock('./feature-i18n',()=>({useFeatureText:()=>((key:string,params:Record<string,unknown>={})=>key.replace(/\{(\w+)\}/g,(_,k)=>String(params[k]??`{${k}}`)))}));
vi.mock('./store',()=>({useAppStore:(select:(s:any)=>unknown)=>select({applyParams:()=>{},settings:{}})}));
import DetectiveArtistLab from './DetectiveArtistLab';
beforeEach(()=>{fixture.index=0;fixture.progress={};fixture.recovery={supported:true,manifestSha256:'a'.repeat(64),pendingRequestHash:'b'.repeat(64),requiresPaidReplayConfirmation:true,message:''};});
const render=()=>renderToStaticMarkup(<DetectiveArtistLab onBack={()=>{}}/>);
it('exposes manual same-run resume without pretending an uncertain request is free',()=>{const html=render();expect(html).toContain('继续当前任务');expect(html).toContain('可能已扣费');expect(html).toContain('已完成图片不会重生成');expect(html).toContain('137/300');expect(html).toContain('新建自动迭代');});
it('explains the legacy limitation instead of relabelling Start as recovery',()=>{fixture.recovery={supported:false,message:'旧任务缺少原账号与接口绑定，无法安全恢复；图片仍保留。'};const html=render();expect(html).toContain('无法安全恢复');expect(html).not.toContain('继续当前任务');});
it('retains ordinary safe resume without a spurious paid-replay warning',()=>{fixture.recovery.requiresPaidReplayConfirmation=false;const html=render();expect(html).toContain('继续当前任务');expect(html).not.toContain('该次结果不明');});

it('shows the render count separately from local scoring and keeps saved images on stop',()=>{
 fixture.progress={running:true,stage:'scoring',completed:32,budget:300,rounds:9,phase:'round-00',phaseCount:32,lastProgressAt:Date.now()-30_000};
 const html=render();
 expect(html).toContain('32/300');
 expect(html).toContain('搜索第 1/9 轮');
 expect(html).toContain('本地评分 · 本批 32 张');
 expect(html).toContain('<progress value="32" max="300">');
 expect(html).toContain('<progress></progress>');
 expect(html).toContain('停止（保留当前请求结果）');
 expect(html).not.toContain('没有新的进度记录');
});
it('warns about stale progress without asserting the GPU has failed, and respects rate-limit waits',()=>{
 fixture.progress={running:true,stage:'scoring',completed:32,rounds:9,phase:'round-00',lastProgressAt:Date.now()-250_000};
 const html=render();
 expect(html).toContain('没有新的进度记录');
 expect(html).toContain('不代表仍在推进');
 expect(html).toContain('run.log');
 fixture.index=0;
 fixture.progress={...fixture.progress,stage:'rate_limited',retryWaitSeconds:240};
 expect(render()).not.toContain('没有新的进度记录');
});
