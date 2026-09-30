import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {useAppStore} from './store';
import {DEFAULT_PARAMS,type AppSettings} from './types';
import {retainedPrompts} from './retained-prompts';
const initial=useAppStore.getState();
afterEach(()=>{useAppStore.setState(initial);vi.unstubAllGlobals();vi.useRealTimers();});
function api(settings:Partial<AppSettings>){
 const bridge={getSettings:vi.fn(async()=>settings),onGenerationPreview:vi.fn(),onUpdateEvent:vi.fn(),accountCached:vi.fn(async()=>({hasToken:false})),isFirstRun:vi.fn(async()=>false),getHistoryDates:vi.fn(async()=>[]),getHistoryGroups:vi.fn(async()=>[]),isPortable:vi.fn(async()=>false),getHistory:vi.fn(async()=>[]),setSetting:vi.fn(async()=>undefined)};
 vi.stubGlobal('window',{naiDesktop:bridge});return bridge;
}
it('desktop no longer offers prompt lock buttons',()=>{
 const source=readFileSync('src/App.tsx','utf8');
 expect(source).not.toContain('toggleLock(');expect(source).not.toContain('className={clsx("lock-btn"');
});
it('mobile generation and settings no longer offer prompt lock controls',()=>{
 for(const file of ['generate_screen.dart','settings_screen.dart'])expect(readFileSync(`mobile/lib/screens/${file}`,'utf8')).not.toContain('state.setPromptLock(');
});
it('restart restores current prompts even with parameter persistence off and stale legacy locks',async()=>{
 api({persistGenerateParams:false,lockStylePrompt:true,lockNegativePrompt:true,savedStylePrompt:'obsolete',savedNegativePrompt:'obsolete',lastGenerationState:{params:{...DEFAULT_PARAMS,stylePrompt:'current',negativePrompt:''}} as any});
 useAppStore.setState({params:{...DEFAULT_PARAMS}});await useAppStore.getState().load();
 expect(useAppStore.getState().params.stylePrompt).toBe('current');expect(useAppStore.getState().params.negativePrompt).toBe('');
});
it('migrates legacy text only for missing fields, never intentional empty values',()=>{
 const legacy={lockStylePrompt:true,lockNegativePrompt:true,savedStylePrompt:'legacy style',savedNegativePrompt:'legacy negative'} as AppSettings;
 expect(retainedPrompts(legacy)).toEqual({stylePrompt:'legacy style',negativePrompt:'legacy negative'});
 expect(retainedPrompts({...legacy,lastGenerationState:{params:{stylePrompt:'',negativePrompt:''}} as any})).toEqual({stylePrompt:'',negativePrompt:''});
 expect(retainedPrompts({...legacy,lockStylePrompt:false,lockNegativePrompt:false})).toEqual({stylePrompt:DEFAULT_PARAMS.stylePrompt,negativePrompt:DEFAULT_PARAMS.negativePrompt});
});
it('every edit and explicit import persists; page changes do not overwrite current text',async()=>{
 const settings={persistGenerateParams:true,stylePromptPresets:[]} as unknown as AppSettings;
 const bridge=api(settings);useAppStore.setState({settings,params:{...DEFAULT_PARAMS}});
 const state=useAppStore.getState();state.setParam('stylePrompt','edited style');state.setParam('negativePrompt','');
 state.setActiveTab('inspect');state.setActiveTab('generate');
 expect(useAppStore.getState().params).toMatchObject({stylePrompt:'edited style',negativePrompt:''});
 const last=bridge.setSetting.mock.calls.at(-1) as unknown as [string,any];
 expect(last[0]).toBe('lastGenerationState');expect(last[1].params).toMatchObject({stylePrompt:'edited style',negativePrompt:''});
 state.restoreImportedMetadata({stylePrompt:'explicit imported style',negativePrompt:'explicit imported negative'},[],{preserveMissing:true});
 expect(useAppStore.getState().params).toMatchObject({stylePrompt:'explicit imported style',negativePrompt:'explicit imported negative'});
});
it('reverse prompt result never implicitly replaces style or negative text',async()=>{
 vi.useFakeTimers();const settings={reversePromptTemplateVersion:'v5'} as AppSettings;const bridge=api(settings);
 Object.assign(bridge,{reversePrompt:vi.fn(async()=>({ok:true,prompt:'a new scene'})),addReverseHistoryItem:vi.fn(async()=>undefined)});
 useAppStore.setState({settings,params:{...DEFAULT_PARAMS,stylePrompt:'keep style',negativePrompt:'keep negative'},inspectImageBase64:'fixture-image',reverseJobs:[]});
 await useAppStore.getState().runReversePrompt();
 expect(useAppStore.getState().reversePromptText).toBe('a new scene');
 expect(useAppStore.getState().params).toMatchObject({stylePrompt:'keep style',negativePrompt:'keep negative'});
});
