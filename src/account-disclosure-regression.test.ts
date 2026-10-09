import {readFileSync} from 'node:fs';
import {describe,it,expect,vi,afterEach} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {desktopUiText,desktopUiFormat} from './i18n';
import {DEFAULT_PARAMS} from './types';
import {estimateOpusImages} from './anlas';
import {naiAccountText} from './nai-accounts-locales';
const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AccountAndRunButton')!;
const code=ts.transpileModule(component.getText(parsed),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
afterEach(()=>vi.unstubAllGlobals());
function render(account:Record<string,unknown>,model='nai-diffusion-5-full'){
 vi.stubGlobal('window',{location:{search:''}});vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{}});
 const state={account,params:{...DEFAULT_PARAMS,model},settings:{language:'zh-CN'},generationQueue:[],isGenerating:false};
 const plain=({children,...props}:any)=>React.createElement('span',props,children);
 const Component=new Function('React','useAppStore','useState','useCallback','AnimatedCollapse','clsx','desktopUiText','desktopUiFormat','isNAIV5Model','estimateOpusImages','Icon','Button','IconText','QueuePanel','OpusUsageDialog',code+';return AccountAndRunButton;')(React,(select:any)=>select(state),React.useState,React.useCallback,({children}:any)=>React.createElement('div',null,children),(...values:any[])=>values.filter(Boolean).join(' '),desktopUiText,desktopUiFormat,(m:string)=>m.startsWith('nai-diffusion-5-'),estimateOpusImages,()=>null,plain,plain,()=>null,()=>null);
 return renderToStaticMarkup(React.createElement(Component,{label:'TEST no generation',model,onRun:()=>{},openSettings:()=>{}}));
}
describe('NovelAI allowance actual React render (controlled state, not native UI)',()=>{
 for(const balance of [0,undefined])it(`omits unavailable hint node rather than leaving an empty strip; balance=${balance}`,()=>{
  const html=render({hasToken:true,tierLevel:1,anlasBalance:balance});
  expect(html).not.toContain('account-allowance-empty');expect(html).not.toContain('当前账号／模型没有可展示');expect(html).toContain('account-mini');expect(html).toContain(balance===0?'Anlas：0':'Anlas：未知');
 });
 it('keeps the unconfigured account and setup flow',()=>{const html=render({hasToken:false});expect(html).toContain('account-allowance-empty');expect(html).toContain(desktopUiText('zh-CN','account.setupFirst'));expect(html).toContain(desktopUiText('zh-CN','account.notSet'));});
 for(const percent of [0,20])it(`keeps real V5 Opus allowance ${percent}% visible`,()=>{const html=render({hasToken:true,tierLevel:3,anlasBalance:0,opusUsage:{percent,isNegative:false,timeUntilNextPercent:86400}});expect(html).toContain('account-opus-usage');expect(html).toContain(`aria-valuenow="${percent}"`);expect(html).not.toContain('account-allowance-empty');});
 it('does not show unavailable hint for Opus on a non-V5 model',()=>{const html=render({hasToken:true,tierLevel:3},'nai-diffusion-4-5-full');expect(html).not.toContain('account-opus-usage');expect(html).not.toContain('account-allowance-empty');});
 for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'] as const)it(`retains sign-in localization and verification detail: ${language}`,()=>{expect(desktopUiText(language,'account.allowanceSignIn')).not.toContain('account.allowanceSignIn');const passed=naiAccountText(language,'validationPassed');expect(passed.length).toBeGreaterThan(0);expect(passed.length).toBeLessThan(25);});
});
