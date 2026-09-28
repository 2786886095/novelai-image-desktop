import {beforeEach, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const state=vi.hoisted(()=>({index:0,ready:true,stage:'idle',busy:false,validation:'unchecked'}));
vi.mock('react',async importOriginal=>{
 const React=await importOriginal<typeof import('react')>();
 return {...React,useState:(initial:unknown)=>{
  const index=state.index++;
  if(index===2)return [{ready:state.ready,runtimeValidation:{state:state.validation},running:false,stage:'idle',completed:0,budget:300,candidates:[]},()=>{}];
  if(index===3)return [{stage:state.stage,busy:state.busy,variant:'full',downloaded:0,total:12000000000,bytesPerSecond:0,directory:'fixture-models',message:state.stage==='failed'?'fixture failure':''},()=>{}];
  return React.useState(initial);
 }};
});
vi.mock('./feature-i18n',()=>({useFeatureText:()=>((key:string)=>key)}));
vi.mock('./store',()=>({useAppStore:(select:(value:unknown)=>unknown)=>select({applyParams:()=>{}})}));
import DetectiveArtistLab from './DetectiveArtistLab';
beforeEach(()=>{state.index=0;state.ready=true;state.stage='idle';state.busy=false;state.validation='unchecked';});
const render=()=>renderToStaticMarkup(<DetectiveArtistLab onBack={()=>{}}/>);
it.each([true,false])('hides idle progress before Download is clicked (configured=%s)',ready=>{
 state.ready=ready;const html=render();
 expect(html).not.toContain('<progress');expect(html).not.toContain('0.0 MiB');
 expect(html).toContain('fixture-models');expect(html).toContain('下载并安装 / 继续下载');
});
it.each(['downloading','verifying','extracting','checking','cancelled','failed','complete'])('retains progress after download starts: %s',stage=>{
 state.stage=stage;state.busy=['downloading','verifying','extracting','checking'].includes(stage);
 const html=render();expect(html).toContain('<progress');expect(html).toContain('资源下载进度');
 if(stage==='failed')expect(html).toContain('fixture failure');
 if(state.busy)expect(html).toContain('取消下载');
});
it.each(['idle','cancelled','failed','complete'])('removes the entire download area after verification, including stale %s state',stage=>{
 state.validation='passed';state.stage=stage;const html=render();
 expect(html).toContain('已验证，无需下载');
 expect(html).not.toContain('detective-download-panel');
 expect(html).not.toContain('下载并安装 / 继续下载');
 expect(html).not.toContain('选择存放位置');expect(html).not.toContain('<progress');
});
it('keeps cancellation available if a download is already running',()=>{
 state.validation='passed';state.stage='downloading';state.busy=true;
 const html=render();expect(html).toContain('取消下载');expect(html).not.toContain('下载并安装 / 继续下载');
});
it.each(['unchecked','checking','failed'])('does not treat %s validation as a verified model',validation=>{
 state.validation=validation;const html=render();
 expect(html).toContain('detective-download-panel');expect(html).not.toContain('已验证，无需下载');
});
