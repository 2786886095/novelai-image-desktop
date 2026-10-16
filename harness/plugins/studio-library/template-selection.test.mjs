import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {templatePanelReadArgs,templatePanelSaveArgs} from './template-selection.js';
test('four purposes expose separate model and edition without combining the six bodies',()=>{
 for(const kind of ['convert','reverse','assistant','optimize'])assert.deepEqual(templatePanelReadArgs({kind,mode:'tags',version:'v5',edition:'2.0.0'}),{kind,mode:'tags',templateVersion:'v5',skillVersion:'2.0.0'});
 assert.deepEqual(templatePanelReadArgs({kind:'reverse',version:'v4.5',edition:'2.0.0'}),{kind:'reverse',templateVersion:'v4.5',skillVersion:'1.0.0'});
});
test('save and restore bind the read snapshot edition, model, mode and revision rather than changed global settings',()=>{
 const snapshot={kind:'convert',mode:'tags',templateVersion:'v5',skillVersion:'1.0.0',revision:'exact-read-revision'};
 const {revision,...identity}=snapshot;
 assert.deepEqual(templatePanelSaveArgs(snapshot,'CUSTOM'),{...identity,expectedRevision:revision,body:'CUSTOM',restoreDefault:false});
 assert.deepEqual(templatePanelSaveArgs(snapshot,'CUSTOM',true),{...identity,expectedRevision:revision,body:'',restoreDefault:true});
 assert.throws(()=>templatePanelSaveArgs({...snapshot,skillVersion:undefined},'CUSTOM'));
 assert.throws(()=>templatePanelSaveArgs({...snapshot,skillVersion:'2.0.0',templateVersion:'v4.5'},'CUSTOM'));
});
test('packaged module and source carry the edition selector and snapshot-preserving save helper',()=>{
 const panel=fs.readFileSync(new URL('./template-panel.js',import.meta.url),'utf8'),bundled=fs.readFileSync(new URL('./lib/client.js',import.meta.url),'utf8');
 for(const source of [panel,bundled]){assert.match(source,/技能版本/);assert.match(source,/promptAssistant|assistant/);assert.match(source,/templatePanelSaveArgs/);assert.match(source,/skillVersion/);}
});
