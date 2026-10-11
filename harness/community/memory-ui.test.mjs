import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {simplifyMemoryUI} from './memory-ui.mjs';

const client=await fs.readFile(process.env.MEMORY_CLIENT_PATH || '.tmp/harness-community/packages/mindspace-dsh-session-memory/lib/client.js','utf8');
test('memory UI has no manual mode chip or its polling',()=>{
 assert.equal(false,/id: "session-memory-mode"/.test(client));
 assert.equal(false,/function MemoryModeChip\(/.test(client));
});
test('both existing memory banks remain editable without mode tabs',()=>{
 assert.equal(false,/onClick: \(\) => setTab\("(?:chat|work)"\)/.test(client));
 assert.equal(true,/\["chat", "work"\]\.map/.test(client));
 assert.equal(true,/value: draft\[mode\]/.test(client));
 assert.equal(true,/\[mode\]: value/.test(client));
 assert.equal(true,/SessionMemorySection\)\)/.test(client));
 assert.equal(true,/remote\.replace\(/.test(client));
});
test('patched browser bundle still parses',()=>{new vm.Script(client);});
test('adapter is repeatable and rejects an unknown upstream layout',()=>{
 const next=simplifyMemoryUI(client);
 assert.equal(simplifyMemoryUI(next),next);
 assert.throws(()=>simplifyMemoryUI('unrecognized bundle'),/boundaries changed/);
});
test('bank editors retain the other bank and active selection when updating a draft',()=>{
 const next=simplifyMemoryUI(client),start=next.indexOf('["chat", "work"].map'),end=next.indexOf('}, mode)),',start)+9;
 const draft={chat:{memories:['daily']},work:{memories:['task']},activeMode:'work',revision:7};
 const h=(type,props)=>({type,props});let updated;
 const editors=vm.runInNewContext(next.slice(start,end),{react_jsx_runtime:{jsx:h,jsxs:h},SessionMemorySection_module_css_default:{card:'card'},ModeEditor:'editor',draft,setDraft:fn=>updated=fn(draft)});
 assert.equal(editors.length,2);
 assert.equal(editors[0].props.children[1].props.value,draft.chat);
 assert.equal(editors[1].props.children[1].props.value,draft.work);
 editors[0].props.children[1].props.onChange({memories:['changed']});
 assert.deepEqual(updated.chat,{memories:['changed']});
 assert.equal(updated.work,draft.work);assert.equal(updated.activeMode,'work');assert.equal(updated.revision,7);
});

