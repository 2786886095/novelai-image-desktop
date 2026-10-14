import {expect,it} from 'vitest';
import ig5 from '../../shared/ig5-image-prompts.json';
import {createDefaultImageTaskPromptPreset,createLegacyImageTaskPromptPreset,normalizeImageTaskPromptPresets,imageTaskPresetIds,selectedImageTaskPromptPreset} from './image-task-preset';
import {STUDIO_DEFAULT_PRESET_ID,STUDIO_LEGACY_PRESET_ID,studioPresetId,studioSelectedSystemPrompt,studioCreativeReferenceData} from '../agent/workspace-controls';
import {studioUxText} from '../agent/ux';

it('ships three distinct task adaptations with fixed rules provenance, not an original upstream image prompt',()=>{
 expect(createDefaultImageTaskPromptPreset('convert').systemPrompt).toBe(ig5.prompts.convert);
 expect(createDefaultImageTaskPromptPreset('reverse').systemPrompt).toBe(ig5.prompts.reverse);
 expect(new Set(Object.values(ig5.prompts)).size).toBe(3);
 expect(ig5.commit).toBe('eeff0bbeb905bdc57952dc7497d5fdfc33653c0f');
 expect(STUDIO_DEFAULT_PRESET_ID).toBe('dsh-infinite-gen-5');
 expect(studioSelectedSystemPrompt({samplerPresets:[]} as any,{} as any)).toBe(ig5.prompts.studio);
});
it('migrates an unspecified choice to per-task defaults without changing a saved custom library body',()=>{
 const custom={...createLegacyImageTaskPromptPreset(),id:'custom',name:'my saved name',systemPrompt:'my unchanged system\n中文',jailbreakPrompt:'unchanged postscript',source:'langbai' as const};
 const normalized=normalizeImageTaskPromptPresets([custom]);expect(normalized[0]).toEqual(custom);
 const ids=imageTaskPresetIds({},normalized);expect(ids).toEqual({convertSystemPromptPresetId:'builtin-ig5-convert',reverseSystemPromptPresetId:'builtin-ig5-reverse'});
 expect(imageTaskPresetIds({reverseConvertPromptPresetId:'custom'},normalized)).toEqual({convertSystemPromptPresetId:'custom',reverseSystemPromptPresetId:'custom'});
 expect(imageTaskPresetIds({convertSystemPromptPresetId:'builtin-ig5-convert',reverseSystemPromptPresetId:'custom'},normalized).reverseSystemPromptPresetId).toBe('custom');
});
it('keeps explicit legacy and empty-library choices; removing a choice falls back to its task, not random custom text',()=>{
 const old=createLegacyImageTaskPromptPreset(),presets=normalizeImageTaskPromptPresets([old]);
 expect(imageTaskPresetIds({reverseConvertPromptPresetId:old.id},presets).convertSystemPromptPresetId).toBe(old.id);
 expect(selectedImageTaskPromptPreset(presets,'missing','reverse')?.id).toBe('builtin-ig5-reverse');
 expect(normalizeImageTaskPromptPresets([])).toEqual([]);expect(selectedImageTaskPromptPreset([],'','reverse')).toBeNull();
 expect(studioPresetId(STUDIO_LEGACY_PRESET_ID)).toBe(STUDIO_LEGACY_PRESET_ID);
 expect(studioPresetId('tavern:custom')).toBe('tavern:custom');
});
it('selects Studio imported body and postscript without mutating stored data, and respects explicit off',()=>{
 const workspace={samplerPresets:[{id:'custom',systemPrompt:'SYSTEM_SENTINEL',jailbreakPrompt:'POST_SENTINEL'}]} as any;
 const before=JSON.stringify(workspace);expect(studioSelectedSystemPrompt(workspace,{studioPresetId:'tavern:custom'} as any)).toBe('SYSTEM_SENTINEL\n\nPOST_SENTINEL');
 expect(studioSelectedSystemPrompt(workspace,{studioPresetId:'tavern:custom',studioTemplateEnabled:false} as any)).toBe('');expect(JSON.stringify(workspace)).toBe(before);
});
it.each(['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])('has concrete IG5 name and scope labels in %s',language=>{
 expect(studioUxText(language,'presetInfiniteFive')).not.toBe('presetInfiniteFive');expect(studioUxText(language,'presetInfiniteFiveBody')).not.toBe('presetInfiniteFiveBody');
});

it('Studio reference context carries identifiers only; the selected system body is not duplicated',()=>{
 const ws={samplerPresets:[{id:'custom',name:'custom',systemPrompt:'BODY_SINGLE_COPY',jailbreakPrompt:'POST_SINGLE_COPY'}],characters:[]} as any;
 const chat={studioPresetId:'tavern:custom',characterIds:[]} as any;
 const refs=studioCreativeReferenceData(ws,chat,[]);expect(refs).not.toContain('BODY_SINGLE_COPY');expect(refs).not.toContain('POST_SINGLE_COPY');
 expect(JSON.parse(refs).preset).toMatchObject({id:'tavern:custom',name:'custom'});
 expect(studioSelectedSystemPrompt(ws,chat)).toBe('BODY_SINGLE_COPY\n\nPOST_SINGLE_COPY');
});
