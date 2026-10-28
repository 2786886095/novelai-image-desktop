import {expect,it} from 'vitest';
import ig5 from '../../shared/ig5-image-prompts.json';
import {createDefaultImageTaskPromptPreset,createLegacyImageTaskPromptPreset,normalizeImageTaskPromptPresets,imageTaskPresetIds,selectedImageTaskPromptPreset} from './image-task-preset';

it('ships distinct task adaptations with fixed rules provenance, not an original upstream image prompt',()=>{
 expect(createDefaultImageTaskPromptPreset('convert').systemPrompt).toBe(ig5.prompts.convert);
 expect(createDefaultImageTaskPromptPreset('reverse').systemPrompt).toBe(ig5.prompts.reverse);
 expect(new Set(Object.values(ig5.prompts)).size).toBe(3);
 expect(ig5.commit).toBe('eeff0bbeb905bdc57952dc7497d5fdfc33653c0f');
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
});
