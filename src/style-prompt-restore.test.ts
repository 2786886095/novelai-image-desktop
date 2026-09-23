import {it,expect,vi} from 'vitest';
import {restoreSavedStyle} from './style-prompt-restore';
const presets=[{prompt:'artist:a'},{prompt:'artist:a, artist:b'}];
it('restores the longest saved style, not a partial shorter preset',()=>{
 expect(restoreSavedStyle({stylePrompt:'',positivePrompt:'artist:a, artist:b, 1girl'},presets)).toEqual({stylePrompt:'artist:a, artist:b',positivePrompt:'1girl'});
});
it('leaves unrelated prompts, substring collisions and explicit styles unchanged',()=>{
 for(const p of [{stylePrompt:'',positivePrompt:'1girl, artist:a'}, {stylePrompt:'',positivePrompt:'artist:abc, 1girl'}, {stylePrompt:'kept',positivePrompt:'artist:a, 1girl'}, {positivePrompt:'artist:a, 1girl'}]) expect(restoreSavedStyle(p,presets)).toBe(p);
});
it('supports style-only images and does not mutate the imported patch',()=>{
 const p={stylePrompt:'',positivePrompt:'artist:a'};expect(restoreSavedStyle(p,presets).positivePrompt).toBe('');expect(p.stylePrompt).toBe('');
});

it('restores saved style through the actual generation store import path',async()=>{
 const {useAppStore}=await import('./store');
 const old=useAppStore.getState();
 vi.stubGlobal("window",{naiDesktop:{setSetting:vi.fn().mockResolvedValue(undefined)}});
 try {
 useAppStore.setState({settings:{...old.settings,stylePromptPresets:[{id:'saved',name:'Dream',prompt:'artist:a, artist:b'}]} as any});
 useAppStore.getState().restoreImportedMetadata({stylePrompt:'',positivePrompt:'artist:a, artist:b, 1girl',preservePromptText:true},[],{preserveMissing:true});
 expect(useAppStore.getState().params.stylePrompt).toBe('artist:a, artist:b');
 expect(useAppStore.getState().params.positivePrompt).toBe('1girl');
 expect([useAppStore.getState().params.stylePrompt,useAppStore.getState().params.positivePrompt].join(', ')).toBe('artist:a, artist:b, 1girl');
 } finally {useAppStore.setState(old);vi.unstubAllGlobals();}
});
