// Host regression against historical real macOS stdout, not device acceptance.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as creator from './create-disposable-ios-simulator.mjs';
const actual=JSON.parse(fs.readFileSync(new URL('./fixtures/ios-locale-en-us-observation.json',import.meta.url),'utf8'));
const languageCommand=actual.actualCommands.find(c=>c.command[0]==='/usr/bin/plutil'&&c.command[2]==='AppleLanguages');
const regionCommand=actual.actualCommands.find(c=>c.command[0]==='/usr/bin/plutil'&&c.command[2]==='AppleLocale');
const languages=JSON.parse(languageCommand.stdout),region=regionCommand.stdout.trim();
test('fixed locale exactly matches real macOS en to en-US normalization, not the failed old expectation',()=>{
 assert.equal(actual.sourceSha,'4c2af6e8d119e85e721b83610439c31f9e72ac26');assert.equal(actual.originalExitStatus,1);assert.match(actual.originalFailure,/Actual Simulator locale readback differs/);assert.equal(actual.functionalCertificationGranted,false);
 assert(actual.actualCommands.every(c=>c.exitStatus===0&&c.error===null));assert.deepEqual(actual.originalExpectedLanguages,['en']);assert.deepEqual(languages,['en-US']);assert.equal(region,'en_US');
 assert.deepEqual(creator.iosSimulatorLocalePaths(actual.dataPath,actual.device).languages,languages);
});
test('shared strict locale readback accepts only en-US and en_US, not arbitrary canonicalizations',()=>{
 assert.equal(typeof creator.assertIosSimulatorLocaleReadback,'function');assert.deepEqual(creator.assertIosSimulatorLocaleReadback(languages,region),{languages:['en-US'],locale:'en_US'});
 for(const [l,r]of[[['en'],'en_US'],[['en-GB'],'en_US'],[['zh-Hans'],'en_US'],[['en-US','zh-Hans'],'en_US'],[[],'en_US'],[['en-US'],'en_GB'],[['en-US'],''],[null,'en_US']])assert.throws(()=>creator.assertIosSimulatorLocaleReadback(l,r));
});
