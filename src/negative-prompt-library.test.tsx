import {expect,it,vi,afterEach} from 'vitest';
import fs from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {applyNegativePreset,NEGATIVE_BUILTINS,normalizeNegativePromptPresets,parseNegativeLibrary,exportNegativeLibrary,mergeNegativeLibrary,negativeLibraryText} from './negative-prompt-library';
import {NegativePromptLibraryControl,mutateNegativePresets} from './NegativePromptLibrary';
import {useAppStore} from './store';
afterEach(()=>{vi.unstubAllGlobals();useAppStore.setState(useAppStore.getInitialState(),true);});
it('keeps field focus rings inside the scrolling detail pane without changing dialog geometry',()=>{
 const css=fs.readFileSync('src/negative-prompt-library.css','utf8');
 expect(css).toMatch(/\.negative-library-dialog input:focus-visible,\.negative-library-dialog textarea:focus-visible\s*\{outline-offset:-2px;\}/);
 expect(css).toContain('outline:2px solid var(--accent)');
 expect(css).toContain('article {display:flex;flex-direction:column;gap:.75rem;overflow:auto;');
});
it('seeds exactly the user-provided builtins, including weights, duplicates and literal line breaks',()=>{
 expect(normalizeNegativePromptPresets(undefined)).toEqual(JSON.parse(fs.readFileSync('shared/negative-prompt-presets.json','utf8')));
 expect(NEGATIVE_BUILTINS.map(p=>p.name)).toEqual(['强化版','轻量版']);
 expect(NEGATIVE_BUILTINS[0].prompt).toContain('1.1::frame border');expect(NEGATIVE_BUILTINS[1].prompt).toContain('blank page,mismatched pupils');
 expect(parseNegativeLibrary(exportNegativeLibrary([...NEGATIVE_BUILTINS]))).toEqual(NEGATIVE_BUILTINS);
 expect(normalizeNegativePromptPresets([])).toEqual([]); // deletion survives restart
});
it('replace/append alter only the target negative string without changing its weighted text',()=>{
 const prompt=NEGATIVE_BUILTINS[0].prompt;expect(applyNegativePreset('keep',prompt,'replace')).toBe(prompt);
 expect(applyNegativePreset('keep',prompt,'append')).toBe('keep, '+prompt);expect(applyNegativePreset('keep,',prompt,'append')).toBe('keep, '+prompt);
 expect(applyNegativePreset('',prompt,'append')).toBe(prompt);expect(applyNegativePreset('keep','','append')).toBe('keep');
});
it('import is strict and atomic; duplicates merge without destroying an existing item',()=>{
 for(const doc of ['{}','{"identifier":"langbai-negative-prompt-library","version":2,"presets":[]}',exportNegativeLibrary([...NEGATIVE_BUILTINS]).replace('强化版',''), 'x'.repeat(5000001)])expect(()=>parseNegativeLibrary(doc)).toThrow();
 expect(mergeNegativeLibrary([...NEGATIVE_BUILTINS],[...NEGATIVE_BUILTINS],()=> 'unused')).toEqual(NEGATIVE_BUILTINS);
 const changed={...NEGATIVE_BUILTINS[0],prompt:'custom'};expect(mergeNegativeLibrary([...NEGATIVE_BUILTINS],[changed],()=> 'new-id')[2].id).toBe('new-id');
});
it('serialized setting writes preserve both concurrent changes and reject a failed save without mutation',async()=>{
 const initial={negativePromptPresets:[...NEGATIVE_BUILTINS],language:'zh-CN'};useAppStore.setState({settings:initial as any});
 let stored:any;const setSetting=vi.fn(async(key,value)=>{expect(key).toBe('negativePromptPresets');stored=JSON.parse(JSON.stringify(value));return stored;});vi.stubGlobal('window',{naiDesktop:{setSetting}});
 await Promise.all([mutateNegativePresets(current=>current.map(p=>p.id===initial.negativePromptPresets[0].id?{...p,name:'rename'}:p)),mutateNegativePresets(current=>[...current,{id:'x',name:'X',prompt:'exact ::',createdAt:'now'}])]);
 expect(stored).toHaveLength(3);expect(stored[0].name).toBe('rename');expect(useAppStore.getState().settings?.negativePromptPresets).toEqual(stored);
 setSetting.mockRejectedValueOnce(Error('disk full'));await expect(mutateNegativePresets(()=>[])).rejects.toThrow('disk full');expect(useAppStore.getState().settings?.negativePromptPresets).toEqual(stored);
});
it('SSR uses unloaded-settings fallback without applying; every locale has complete library labels',()=>{
 for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){useAppStore.setState({settings:{language} as any});const applied=vi.fn(),html=renderToStaticMarkup(<NegativePromptLibraryControl value="original" onApply={applied}/>);expect(html).toContain('aria-haspopup="dialog"');expect(html).toContain(negativeLibraryText(undefined)[0]);expect(negativeLibraryText(language)).toHaveLength(20);expect(applied).not.toHaveBeenCalled();}
});
it('library entry reuses the peer icon button without a visible text label',()=>{
 const label=negativeLibraryText(undefined)[0];
 const applied=vi.fn();
 const html=renderToStaticMarkup(<NegativePromptLibraryControl value="original negative" onApply={applied}/>);
 expect(html).toContain('class="compact-icon-button negative-library-trigger"');
 expect(html).toContain(`aria-label="${label}"`);
 expect(html).toContain(`title="${label}"`);
 expect(html).toContain(`data-tooltip="${label}"`);
 expect(html).toContain('aria-expanded="false"');
 expect(html.replace(/<svg[\s\S]*?<\/svg>/g,'').replace(/<[^>]*>/g,'').trim()).toBe('');
 expect(applied).not.toHaveBeenCalled();
});
