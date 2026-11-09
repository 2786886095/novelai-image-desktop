import {describe,expect,it} from 'vitest';
import {
  defaultPromptToolLayout as defaults, movePromptTool, normalizePromptToolLayout,
  PROMPT_MAIN_TOOL_LIMIT, readGlobalPromptToolLayout, replacePromptTool,
} from './prompt-toolbar-layout';

describe('shared prompt toolbar arrangement',()=>{
  it('keeps five default tools in the main bar and pins undo/redo outside the layout',()=>{
    expect(normalizePromptToolLayout(null)).toEqual(defaults);
    const saved={bar:['redo','presets','unknown','presets'],more:['undo','weights','presets']};
    const normalized=normalizePromptToolLayout(saved);
    expect(normalized.bar).toEqual(['presets','translation','optimize','custom','capsule']);
    expect(normalized.more[0]).toBe('weights');
  });
  it('rejects a sixth tool unless an existing main slot is explicitly swapped',()=>{
    expect(movePromptTool(defaults,'normalize','bar',0)).toBe(defaults);
    expect(movePromptTool(defaults,'normalize','bar',5)).toBe(defaults);
    const swapped=replacePromptTool(defaults,'normalize','weights');
    expect(swapped.bar).toEqual(['translation','optimize','custom','normalize','capsule']);
    expect(swapped.more[defaults.more.indexOf('normalize')]).toBe('weights');
    expect(swapped.bar.length).toBe(PROMPT_MAIN_TOOL_LIMIT);
    expect(replacePromptTool(defaults,'normalize','undo')).toBe(defaults);
    expect(replacePromptTool(defaults,'weights','normalize')).toBe(defaults);
  });
  it('allows additions again if the user frees a main slot, and still reorders both zones',()=>{
    const smaller=movePromptTool(defaults,'weights','more',0);
    expect(smaller.bar.length).toBe(4);
    const added=movePromptTool(smaller,'normalize','bar',1);
    expect(added.bar).toEqual(['translation','normalize','optimize','custom','capsule']);
    expect(movePromptTool(added,'normalize','bar',0).bar[0]).toBe('normalize');
    expect(movePromptTool(added,'weights','more',3).more[2]).toBe('weights');
    expect(movePromptTool(added,'redo','bar',0)).toBe(added);
  });
  it('migrates excess saved tools into more without losing tools and reads a single global preference first',()=>{
    const legacy={bar:[...defaults.bar,'normalize','chunks'],more:['presets']};
    const expected=normalizePromptToolLayout(legacy);
    expect(expected.bar).toEqual(defaults.bar);
    expect(expected.more.slice(0,3)).toEqual(['normalize','chunks','presets']);
    expect(new Set([...expected.bar,...expected.more]).size).toBe(defaults.bar.length+defaults.more.length);
    const legacyReader=(scope:string)=>scope==='positive'?JSON.stringify(legacy):'{';
    expect(readGlobalPromptToolLayout('',legacyReader)).toEqual(expected);
    const global=replacePromptTool(defaults,'presets','translation');
    expect(readGlobalPromptToolLayout(JSON.stringify(global),legacyReader)).toEqual(global);
  });
});
