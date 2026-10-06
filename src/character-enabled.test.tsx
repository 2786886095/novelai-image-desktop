import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CharacterEnabledToggle,characterEnabledLabels,reorderCharacters,syncCharacterSlots} from './components/CharacterEditing';
import {normalizeCharacterCaptions,normalizeCharacterPresets} from './character-presets';
import {useAppStore} from './store';

beforeEach(()=>useAppStore.setState(useAppStore.getInitialState(),true));
afterEach(()=>vi.unstubAllGlobals());
const cast=[{id:'a',enabled:false,prompt:' exact, text, text ',negativePrompt:'negative',useCoords:true,x:0,y:1},{id:'b',prompt:'blue coat',negativePrompt:'',useCoords:false,x:.5,y:.5}];
it('keeps pause state, content, identity and coordinates in storage, reorder and presets',()=>{
 expect(normalizeCharacterCaptions(cast)).toEqual(cast);
 expect(normalizeCharacterCaptions([{...cast[0],enabled:'false'}])[0].enabled).toBeUndefined();
 const reordered=reorderCharacters(cast,0,1);
 expect(reordered[1]).toBe(cast[0]);expect(syncCharacterSlots(reordered,cast)[1].enabled).toBe(false);
 expect(normalizeCharacterPresets([{id:'p',name:'P',captions:cast}])[0].captions[0].enabled).toBe(false);
});
it('persists independent switches through a fresh store and restores without erasing fields',async()=>{
 let settings:any={language:'en-US',persistGenerateParams:true};
 vi.stubGlobal('window',{naiDesktop:{setSetting:async(key:string,value:any)=>{settings={...settings,[key]:structuredClone(value)};},getSettings:async()=>settings,
 onGenerationPreview:()=>()=>{},onUpdateEvent:()=>()=>{},accountCached:async()=>({hasToken:false}),isFirstRun:async()=>false,getHistoryDates:async()=>[],getHistoryGroups:async()=>[],isPortable:async()=>false,getHistory:async()=>[]}});
 await useAppStore.getState().load();useAppStore.getState().setCharCaptions(cast);
 useAppStore.getState().updateCharCaption('b',{enabled:false});
 useAppStore.setState(useAppStore.getInitialState(),true);await useAppStore.getState().load();
 expect(useAppStore.getState().charCaptions).toEqual([cast[0],{...cast[1],enabled:false}]);
 useAppStore.getState().updateCharCaption('a',{enabled:true});
 expect(useAppStore.getState().charCaptions).toEqual([{...cast[0],enabled:true},{...cast[1],enabled:false}]);
 useAppStore.getState().addCharCaption();expect(useAppStore.getState().charCaptions[2].enabled).toBe(true);
});
it('switch is accessible, stays separate from collapse/delete, and toggles exactly once',()=>{
 const onChange=vi.fn();const labels=characterEnabledLabels('zh-CN');
 const node=CharacterEnabledToggle({enabled:false,label:'角色 1',onLabel:labels.on,offLabel:labels.off,onChange});
 expect(node.props.role).toBe('switch');expect(node.props['aria-checked']).toBe(false);
 node.props.onClick();expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
 const html=renderToStaticMarkup(node);expect(html).toContain('aria-label="角色 1"');expect(html).toContain('已暂停');
 for(const lang of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){const l=characterEnabledLabels(lang);expect(l.on).not.toBe(l.off);expect(l.label).toBeTruthy();}
});
