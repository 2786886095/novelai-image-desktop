import assert from 'node:assert/strict';
export const uiSupplementRun='44153610287';
export const uiSupplementPolicySha='9f2ea9b65d42de88ad5df61066cc08aa19329f17';
export const applicationSourceSha='c7e3c194e90e9a8d4494d04604518ec5c5d86de5';
export function assertV297UiSupplement(original,supplement){
 assert.equal(original.headSha,applicationSourceSha);assert.equal(original.status,'completed');assert.equal(original.conclusion,'failure');
 const groups=['core','text','library','os','metadata','gallery','japanese','generation','ui','workflows'];
 const expected=['windows-latest','macos-15','ubuntu-24.04'].map(p=>'desktop-components ('+p+')').concat(['android','ios'].flatMap(p=>groups.map(g=>p+'-components ('+g+')'))).concat('windows-artist-local-proof','full-client-feature-matrix');
 assert.deepEqual(original.jobs.map(j=>j.name).sort(),expected.sort());
 for(const j of original.jobs){
  assert.equal(j.status,'completed',j.name);
  if(j.name==='ios-components (ui)'){assert.equal(j.conclusion,'cancelled');assert.equal(j.steps.length,0,'A started test failure cannot be replaced as runner capacity');}
  else if(j.name==='windows-artist-local-proof')assert.equal(j.conclusion,'skipped');
  else if(j.name==='full-client-feature-matrix'){
   assert.equal(j.conclusion,'failure');
   assert.deepEqual(j.steps.filter(s=>s.conclusion==='failure').map(s=>s.name),['Verify all required cloud cells and preserve the exact matrix']);
   for(const step of ['Run actions/download-artifact@v4','Check matrix rejection rules','Run actions/upload-artifact@v4'])assert(j.steps.some(s=>s.name===step&&s.conclusion==='success'),step);
  }else assert.equal(j.conclusion,'success',j.name);
 }
 assert.equal(String(supplement.databaseId),uiSupplementRun);assert.equal(supplement.headSha,uiSupplementPolicySha);assert.equal(supplement.status,'completed');assert.equal(supplement.conclusion,'success');
 const skips=['build','mac-intel-smoke','publish-verified','publish-v297-explicit-gpu-waiver'],passes=['v297-ios-ui-supplement','v297-recombined-native-evidence'];
 assert.deepEqual(supplement.jobs.map(j=>j.name).sort(),[...skips,...passes].sort());
 for(const j of supplement.jobs){
  assert.equal(j.status,'completed',j.name);assert.equal(j.conclusion,passes.includes(j.name)?'success':'skipped',j.name);
 }
 const ui=supplement.jobs.find(j=>j.name==='v297-ios-ui-supplement');
 for(const name of ['Verify exact checkout bytes against index and commit','Check strict Simulator locale and own-device cleanup','Create and boot a new disposable iOS Simulator','Run independently counted component and client-scenario entries','Stop only the newly created test simulator'])assert(ui.steps.some(s=>s.name===name&&s.conclusion==='success'),'Missing genuine UI native step: '+name);
 const aggregate=supplement.jobs.find(j=>j.name==='v297-recombined-native-evidence');
 assert(aggregate.steps.some(s=>s.name==='Revalidate every same-source native scenario and only the approved GPU omission'&&s.conclusion==='success'));
}
