import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.env.STYLE_PICKER_SOURCE_ROOT||process.cwd();
const app=()=>readFileSync(resolve(root,'src/App.tsx'),'utf8');
it('removes sorting from the style picker while retaining saved order',()=>{
 expect(app()).not.toContain('<StyleSortSelect/>');
 expect(app()).toContain('sortStyles(stylePromptPresets, settings?.stylePromptPresetSort)');
});
it('removes management from the picker while retaining groups and the independent library',()=>{
 const source=app();
 const picker=source.slice(source.indexOf('<div className="style-preset-menu-list">'),source.indexOf('{stylePromptPresetGroups.map'));
 expect(picker).not.toContain('setActiveTab("styles")');
 expect(source).not.toContain('styleText');
 expect(source).toContain('stylePromptPresetGroups.map');
 expect(source).toContain('<StyleLibrary');
});
