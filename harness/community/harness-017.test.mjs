import {test} from 'node:test';import assert from 'node:assert/strict';
import {adaptStrictCodecs,adaptSettingsScope,adaptIcons} from './harness-017.mjs';
import {descriptor} from '../plugins/studio-library/protocol.js';
test('0.1.7 codec factory retains validation and idempotent migration',()=>{
 const text="{mode:'strict',typeSymbol:'test#X',schema: Value$schema}";
 const adapted=adaptStrictCodecs(text);
 assert.match(adapted,/create: \(\) => Value\$schema/);
 assert.equal(adaptStrictCodecs(adapted),adapted);
 assert.equal(adaptStrictCodecs("{schema: UserSettings}"),"{schema: UserSettings}");
 for(const codec of [descriptor.result,...descriptor.parameters.map(p=>p.codec)]){
  assert.equal(codec.create(),codec.schema);assert.equal(codec.create().parse('value'),'value');
  assert.throws(()=>codec.create().parse({}));assert.throws(()=>codec.create().parse('x'.repeat(2_000_001)));
 }
});
test('settings and icons adapt to 0.1.7 without touching settings data',()=>{
 const src="['settingsScope'];ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });IconChevronDownOutline14;IconUserOutline16";
 const next=adaptIcons(adaptSettingsScope(src));assert.match(next,/configForms.get\(SETTINGS_NAMESPACE\)/);assert.match(next,/IconUserOutlineRegular/);
 assert.equal(adaptIcons(adaptSettingsScope(next)),next);
 assert.equal(adaptSettingsScope('user text remains'),'user text remains');
});
