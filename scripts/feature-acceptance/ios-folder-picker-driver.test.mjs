// Host policy/source-shape tests only: no Simulator/XCTest success is claimed.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateIosFolderRequest,assertIosPickerUiResult,iosPickerProject,iosPickerScheme,prepareIosFolderPickerDriver,iosSimulatorAppPid,bindIosSimulatorProcess,iosHostProcessIdentity} from './ios-folder-picker-driver.mjs';
import {iosSimulatorLocalePaths}from './create-disposable-ios-simulator.mjs';
import {fullFeatureProfiles}from './full-feature-profiles.mjs';import{mobileScenarioInventories}from './mobile-scenario-inventory.mjs';import{mobileNativeEntries,selectMobileNativeEntries}from './mobile-entry-specs.mjs';
const sourceSha='a'.repeat(40),profileSha='b'.repeat(64),nativePid=5317,nonce='5317-1793240012345678';
const begin={sourceSha,profileSha,nativePid,platform:'ios',testEntry:'ios_folder1',expectedChecks:1,nativeOnly:true,mockOnly:false,paidCalls:0,kind:'device'};
const request={sourceSha,profileSha,nativePid,platform:'ios',nonce,requiredFolderName:'NativeOutput-'+nonce,deadlineSeconds:180};
const context={sourceSha,profileSha,nativePid,begin,request,device:'ABCDE123-1234-1234-ABCD-123456ABCDEF',appId:'com.codex.novelai.novelaiMobile',isolated:true,entry:'ios_folder1'};
const ui={sourceSha,profileSha,nativePid,nonce,requiredFolderName:request.requiredFolderName,appId:context.appId,actualSystemPicker:true,localProvider:'On My iPhone',createdExactNonceFolder:true,confirmedSelection:true,targetAppNotLaunchedOrTerminated:true,actions:['new-folder-via-system-picker','create-exact-nonce-folder','confirm-system-directory-selection'].map(action=>({action,label:'Unit fixture only',identifier:''}))};
const output=p=>'unit-policy-fixture IOS_FOLDER_PICKER_UI_RESULT:'+JSON.stringify(p)+'\n';
test('source-qualified exact same native process request binds a single nonce directory, not arbitrary paths',()=>{assert.equal(validateIosFolderRequest(context),request.requiredFolderName);for(const change of [{isolated:false},{entry:'android_folder1'},{device:'physical-device'},{nativePid:99},{sourceSha:'c'.repeat(40)},{profileSha:'d'.repeat(64)}])assert.throws(()=>validateIosFolderRequest({...context,...change}));});
test('foreign BEGIN and requests cannot drive a system picker',()=>{for(const change of [{platform:'android'},{nativePid:123},{sourceSha:'c'.repeat(40)},{expectedChecks:2},{nativeOnly:false},{mockOnly:true},{paidCalls:1},{testEntry:'os6'}])assert.throws(()=>validateIosFolderRequest({...context,begin:{...begin,...change}}));for(const change of [{platform:'android'},{nativePid:123},{nonce:'../escape'},{requiredFolderName:'/tmp/chosen'},{deadlineSeconds:181},{sourceSha:'c'.repeat(40)}])assert.throws(()=>validateIosFolderRequest({...context,request:{...request,...change}}));});
test('OS PID witness requires one running exact bundle service, never a request echo or similarly named app',()=>{
 const line=`${nativePid}\t0\tUIKitApplication:${context.appId}[0xabcd][rb-legacy]`;
 assert.equal(iosSimulatorAppPid('PID Status Label\n'+line+'\n99 0 UIKitApplication:'+context.appId+'.extra[abc]',context.appId),nativePid);
 for(const text of ['',line+'\n'+line,line.replace(String(nativePid),'-'),line.replace(String(nativePid),'0'),line.replace(context.appId,context.appId+'.extra'),JSON.stringify(request)])assert.throws(()=>iosSimulatorAppPid(text,context.appId));
});
test('deterministic system locale is confined to the actual fresh Simulator and configured before boot',()=>{
 const data='/Users/runner/Library/Developer/CoreSimulator/Devices/'+context.device+'/data';
 assert.equal(iosSimulatorLocalePaths(data,context.device).locale,'en_US');
 assert.deepEqual(iosSimulatorLocalePaths(data,context.device).languages,['en-US']);
 for(const p of ['/Users/runner/Library/Preferences',data+'/../data',data.replace(context.device,'12345678-1234-1234-1234-123456789abc'),data+'/Library'])assert.throws(()=>iosSimulatorLocalePaths(p,context.device));
 const creator=fs.readFileSync(new URL('./create-disposable-ios-simulator.mjs',import.meta.url),'utf8');const write=creator.indexOf("'AppleLanguages','-array',...locale.languages"),boot=creator.indexOf("'boot',device");assert(write>=0&&write<boot);assert(creator.includes("'AppleLocale','raw','-o','-'"));assert(creator.includes('assertIosSimulatorLocaleReadback(languages,region)'));
 const driver=fs.readFileSync(new URL('./ios-folder-picker-driver.mjs',import.meta.url),'utf8');assert(driver.includes("'-testLanguage','en','-testRegion','US'"));assert(driver.includes("observedPidBefore=await observePid('BEFORE')"));assert(driver.includes("observedPidAfter=await observePid('AFTER')"));
 assert(driver.includes('assertIosSimulatorLocaleReadback(actualLanguages,actualLocale)'));
});
test('one overall REQUEST budget includes both real PID queries and bounded UI termination below Dart180 seconds',()=>{
 const driver=fs.readFileSync(new URL('./ios-folder-picker-driver.mjs',import.meta.url),'utf8');assert(driver.includes('requestDeadline=now()+160000'));assert(driver.includes('Math.min(5000,remaining())'));assert(driver.includes('Math.min(140000,remaining()-10000)'));assert(driver.includes('runBoundedNativeCommand(argv,{cwd,env,timeout,killGrace:1000,drainGrace:1000'));assert(driver.includes('!r.cleanupComplete||r.signal!==null'));assert(driver.includes('remaining();fs.writeFileSync'));assert(driver.includes("'-default-test-execution-time-allowance','120'"));
});
test('XCTest support result must match all native bindings and genuine external-provider action trace',()=>{assert.deepEqual(assertIosPickerUiResult(output(ui),context),ui);for(const change of [{nonce:'other'},{sourceSha:'c'.repeat(40)},{nativePid:111},{appId:'another.app'},{actualSystemPicker:false},{createdExactNonceFolder:false},{confirmedSelection:false},{targetAppNotLaunchedOrTerminated:false},{localProvider:'App Documents'},{actions:[]}])assert.throws(()=>assertIosPickerUiResult(output({...ui,...change}),context));assert.throws(()=>assertIosPickerUiResult('',context));assert.throws(()=>assertIosPickerUiResult(output(ui)+output(ui),context));});
test('all 126 non-Windows-local scenarios have exactly one fixed native entry per mobile platform',()=>{const required=Object.entries(fullFeatureProfiles).filter(([f])=>!['artist-iteration','agent-components'].includes(f)).flatMap(([f,p])=>p.scenarios.map(s=>f+'/'+s));assert.equal(required.length,126);for(const platform of ['android','ios']){const actual=selectMobileNativeEntries('all',platform).flatMap(e=>mobileScenarioInventories[e]??[]);assert.equal(actual.length,new Set(actual).size);assert.deepEqual(actual.sort(),[...required].sort());}assert.deepEqual(mobileNativeEntries.ios_folder1,{testFile:'integration_test/native_ios_output_folder_scenario.dart',expectedChecks:1,scenarioChecks:1,platforms:['ios']});assert(!selectMobileNativeEntries('all','android').includes('ios_folder1'));});
test('separate XCTest UI target is generated externally, never an app host or modified Runner project',()=>{const p=iosPickerProject();assert(p.includes('com.apple.product-type.bundle.ui-testing'));assert(p.includes('TEST_TARGET_NAME=""'));assert(!p.includes('com.apple.product-type.application'));assert(!p.includes('Runner.xcodeproj'));assert(iosPickerScheme.includes('FolderPickerUITests'));const ids=[...p.matchAll(/^(A[0-9A-F]+)=/gm)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);assert(ids.every(v=>v.length===24));});
test('Swift fixture uses actual system hierarchy and nonce naming; it never launches the client or writes a grant',()=>{const s=fs.readFileSync(new URL('./fixtures/ios-folder-picker-ui.swift',import.meta.url),'utf8');for(const text of ['XCUIApplication(bundleIdentifier: bundle)','New Folder','On My iPhone','On My iPad','field.typeText(folder)','XCUIScreen.main.screenshot()','app.debugDescription','IOS_FOLDER_PICKER_UI_RESULT:'])assert(s.includes(text));assert(!/\.launch\s*\(|\.terminate\s*\(|UserDefaults|bookmarkData|MethodChannel|coordinate\(/.test(s));const runner=fs.readFileSync(new URL('./run-mobile-native.mjs',import.meta.url),'utf8');assert(runner.indexOf('await prepareIosFolderPickerDriver')<runner.indexOf("nativeCommand = [input.flutter, 'run', '--machine'"));assert(runner.includes('onNativeLine:picker?.onLine'));assert(runner.includes('await picker.finish()'));});
test('system driver refuses non-macOS or non-CI environments instead of promoting host fixtures',async()=>{await assert.rejects(()=>prepareIosFolderPickerDriver({...context,environment:{GITHUB_ACTIONS:'false'}}),/Real isolated macOS CI/);});

test('host libproc identity binds exact PID/start time/executable to the fixed Simulator bundle, with no alias fallback',()=>{
 const data='/Users/runner/Library/Developer/CoreSimulator/Devices/'+context.device+'/data';
 const app=data+'/Containers/Bundle/Application/11111111-1111-1111-1111-111111111111/Runner.app';
 const identity={schemaVersion:1,observer:'darwin-libproc',pid:nativePid,executablePath:app+'/Runner',startSeconds:'1793164064',startMicroseconds:990729};
 const args={processStdout:'IOS_PROCESS_IDENTITY:'+JSON.stringify(identity),bundleInfo:{CFBundleIdentifier:context.appId,CFBundleExecutable:'Runner'},device:context.device,appId:context.appId,nativePid,simulatorDataPath:data};
 const bound=bindIosSimulatorProcess(args,value=>value);assert.equal(bound.pid,nativePid);assert.equal(bound.executablePath,app+'/Runner');assert.equal(bound.startSeconds,'1793164064');
 for(const change of [{pid:nativePid+1},{observer:'echo'},{startSeconds:'0'},{startMicroseconds:1000000},{executablePath:app+'/Runner-extra'},{executablePath:app.replace(context.device,'12345678-1234-1234-1234-123456789abc')+'/Runner'}])assert.throws(()=>bindIosSimulatorProcess({...args,processStdout:'IOS_PROCESS_IDENTITY:'+JSON.stringify({...identity,...change})},value=>value));
 for(const change of [{processStdout:'IOS_PROCESS_IDENTITY:'+JSON.stringify({...identity,executablePath:app+'/../Runner'})},{processStdout:'IOS_PROCESS_IDENTITY:'+JSON.stringify({...identity,executablePath:app.replace(context.device,'12345678-1234-1234-1234-123456789abc')+'/Runner'})},{bundleInfo:{CFBundleIdentifier:context.appId+'.extra',CFBundleExecutable:'Runner'}},{bundleInfo:{CFBundleIdentifier:context.appId,CFBundleExecutable:'../Runner'}}])assert.throws(()=>bindIosSimulatorProcess({...args,...change},value=>value));
 assert.throws(()=>bindIosSimulatorProcess(args,value=>value===data?data+'-foreign':value),/Aliased/);
 assert.throws(()=>iosHostProcessIdentity(JSON.stringify(request),nativePid));assert.throws(()=>iosHostProcessIdentity(args.processStdout+'\n'+args.processStdout,nativePid));
});
test('macOS host observer uses read-only libproc and is built before the request; no launchctl query survives',()=>{
 const driver=fs.readFileSync(new URL('./ios-folder-picker-driver.mjs',import.meta.url),'utf8');
 assert(!driver.includes("['xcrun','simctl','spawn'"));assert(driver.includes("'--sdk','macosx','clang'"));assert(!driver.includes("['xcrun','simctl','get_app_container'"));assert(driver.includes("'PID_CONFIRM_'+phase+'.json'"));assert(driver.includes('JSON.stringify(processIdentityAfter)!==JSON.stringify(processIdentityBefore)'));assert(driver.includes("phaseDeadline=now()+Math.min(5000,remaining())"));assert(driver.includes('Math.min(phaseDeadline-now(),remaining())'));
 const c=fs.readFileSync(new URL('./fixtures/ios-process-identity.c',import.meta.url),'utf8');
 for(const text of ['proc_pidinfo(pid, PROC_PIDTBSDINFO','proc_pidpath(pid, first','proc_pidpath(pid, second','before.pbi_start_tvsec != after.pbi_start_tvsec','before.pbi_start_tvusec != after.pbi_start_tvusec'])assert(c.includes(text));
 assert(!c.includes('<sys/proc.h>')&&!c.includes('SZOMB')&&!c.includes('PROC_FLAG_INEXIT'));
 assert(!/\bkill\s*\(|\bexec\w*\s*\(|getenv\s*\(|launchctl/.test(c.replace(/\/\/[^\r\n]*/g,'')));
});

test('process birth brackets both executable reads and plist leaf resolves before any read',()=>{const c=fs.readFileSync(new URL('./fixtures/ios-process-identity.c',import.meta.url),'utf8');assert(c.indexOf('read_info(pid, &before)')<c.indexOf('proc_pidpath(pid, first'));assert(c.indexOf('proc_pidpath(pid, second')<c.indexOf('read_info(pid, &after)'));const driver=fs.readFileSync(new URL('./ios-folder-picker-driver.mjs',import.meta.url),'utf8');assert(driver.indexOf('canonicalize(infoPath)!==infoPath')<driver.indexOf("const info=await checked(['/usr/bin/plutil'"));});

test('kernel bundle derivation rejects extra nesting, foreign roots, extensions and aliased executable leaves',()=>{
 const data='/Users/runner/Library/Developer/CoreSimulator/Devices/'+context.device+'/data';
 const base=data+'/Containers/Bundle/Application/11111111-1111-1111-1111-111111111111/Runner.app';
 const info={CFBundleIdentifier:context.appId,CFBundleExecutable:'Runner'};
 const bind=(file,canonicalize=value=>value)=>bindIosSimulatorProcess({processStdout:'IOS_PROCESS_IDENTITY:'+JSON.stringify({schemaVersion:1,observer:'darwin-libproc',pid:nativePid,executablePath:file,startSeconds:'1793170060',startMicroseconds:309983}),bundleInfo:info,device:context.device,appId:context.appId,nativePid,simulatorDataPath:data},canonicalize);
 assert.equal(bind(base+'/Runner').appContainer,base);
 for(const file of [base+'/Nested.app/Runner',base+'/PlugIns/Example.appex/Runner',base+'/sub/Runner',base+'/../Runner',base.replace('11111111-1111-1111-1111-111111111111','not-uuid')+'/Runner',base.replace(context.device,'12345678-1234-1234-1234-123456789abc')+'/Runner','/foreign/Runner.app/Runner'])assert.throws(()=>bind(file),file);
 assert.throws(()=>bind(base+'/Runner',value=>value===base+'/Runner'?'/foreign/Runner':value),/Aliased/);
});

// STATIC / observed-tree contracts below, not XCTest execution. Actual failure
// 50fff569 / run40656320486 / job122708103189 was0CHECK. The captured Browse
// labels/frames are real; isHittable was not in debugDescription and is varied
// explicitly as a synthetic assumption, never promoted to a device observation.
const observedBrowseTitleShape=Object.freeze({
 sourceSha:'50fff569be1df2a26b7c339d24fa45d1de768e84',runId:40656320486,artifactId:12803020104,
 treeSha256:'17e9c1535a1564bd55818a4167735d8afa5ba6da6ed7b8892d597a747594d48c',wholeArtifactDigestVerified:false,
 treeMemberPayloadRef:'0~ai_2OVTW4-e80JMQqrQWrJUiHsPLOVu37C0K2hVwB0iMzgDLm5e6GAnl6SIpljISpJMFj9el3HIZmpOWYjf6mw==',
 wholeZipNotCertified:true,observedCurrentTitle:'Browse',genericNavigationBarId:'FullDocumentManagerViewControllerNavigationBar',
 view:[0,0,393,852],bar:[0,69,393,108],title:[167,86.7,59,20.3],
 cachedRoot:'DOC.browsingRoot Source: com.apple.FileProvider.LocalStorage, Title: On My iPhone',
 sidebar:'DOC.sidebar.item.On My iPhone',isHittableWasCaptured:false});
const swiftSource=()=>fs.readFileSync(new URL('./fixtures/ios-folder-picker-ui.swift',import.meta.url),'utf8');
// A source-selected static policy model, deliberately NOT an XCUI implementation
// or mock supplied to the native runner. Source-shape guards bind its branches.
function titleContract(source,shape){
 const contains=(a,b)=>b[2]>0&&b[3]>0&&b[0]>=a[0]&&b[1]>=a[1]&&b[0]+b[2]<=a[0]+a[2]&&b[1]+b[3]<=a[1]+a[3];
 const intersect=(a,b)=>Math.min(a[0]+a[2],b[0]+b[2])>Math.max(a[0],b[0])&&Math.min(a[1]+a[3],b[1]+b[3])>Math.max(a[1],b[1]);
 if(!source.includes('private func currentNavigationTitle('))return shape.legacyQuery??null;
 const found=[];
 for(const bar of shape.bars){
  if(!bar.exists||!intersect(shape.view,bar.frame))continue;
  const titles=bar.directStaticTexts.filter(t=>t.exists&&t.hittable&&contains(bar.frame,t.frame)&&contains(shape.view,t.frame));
  assert(titles.length<=1,'Ambiguous visible direct navigation titles');found.push(...titles);
 }
 assert(found.length<=1,'Ambiguous current visible navigation bars');return found[0]?.label??null;
}
const shape=(label='On My iPhone')=>({view:[0,0,393,852],legacyQuery:null,
 bars:[{exists:true,identifier:'FullDocumentManagerViewControllerNavigationBar',frame:[0,69,393,108],
 directStaticTexts:[{exists:true,hittable:true,label,frame:[100,86,190,21]}],
 descendantBackButtonTexts:['On My iPhone']}],sidebar:['On My iPhone'],cachedRoot:observedBrowseTitleShape.cachedRoot});
test('static Swift title policy binds one current visible direct StaticText, not recursive back-button descendants',()=>{
 const s=swiftSource();assert(s.includes('private func currentNavigationTitle('));
 const body=s.split('private func currentNavigationTitle(')[1].split('private func waitForNavigationTitle(')[0];
 for(const value of ['app.navigationBars.allElementsBoundByIndex','bar.children(matching: .staticText).allElementsBoundByIndex',
  'title.exists && title.isHittable','barFrame.contains(titleFrame)','viewFrame.contains(titleFrame)',
  'directTitles.count <= 1','visibleTitles.count <= 1','return visibleTitles.first?.label'])assert(body.includes(value),value);
 assert(!body.includes('.staticTexts'));assert(!body.includes('descendants('));assert(!body.includes('app.cells'));
 assert(!body.includes('DOC.browsingRoot'));assert(!s.includes('app.navigationBars[$0]'));assert(!s.includes('app.navigationBars[folder]'));
});
test('observed real Browse title stays a provider-negative despite cached LocalStorage title and sidebar label',()=>{
 assert.equal(observedBrowseTitleShape.isHittableWasCaptured,false);assert.equal(observedBrowseTitleShape.wholeArtifactDigestVerified,false);
 for(const assumedHittable of [false,true]){
  const fixture=shape('Browse');fixture.bars[0].directStaticTexts[0].hittable=assumedHittable;
  fixture.bars[0].frame=observedBrowseTitleShape.bar;fixture.bars[0].directStaticTexts[0].frame=observedBrowseTitleShape.title;
  assert(!['On My iPhone','On My iPad'].includes(titleContract(swiftSource(),fixture)));
 }
});
test('synthetic generic-bar provider and exact nonce-folder titles are recognized without naming the navigation bar',()=>{
 for(const title of ['On My iPhone','On My iPad',request.requiredFolderName])assert.equal(titleContract(swiftSource(),shape(title)),title);
 // These are synthetic positive controls. The actual provider-open frame was
 // not captured on the failed run, so they carry zero device acceptance credit.
});
test('static sidebar, descendant back-button, hidden/offscreen, wrong-current and ambiguous title controls fail closed',()=>{
 const s=swiftSource();assert.equal(titleContract(s,shape('Different Folder')),'Different Folder');
 for(const mutate of [x=>x.bars[0].directStaticTexts=[],x=>x.bars[0].directStaticTexts[0].hittable=false,
  x=>x.bars[0].directStaticTexts[0].exists=false,x=>x.bars[0].directStaticTexts[0].frame=[100,900,190,21],
  x=>x.bars[0].frame=[393,69,393,108],x=>x.bars=[]]){
  const fixture=shape();mutate(fixture);assert.equal(titleContract(s,fixture),null);
 }
 const double=shape();double.bars.push(structuredClone(double.bars[0]));assert.throws(()=>titleContract(s,double),/Ambiguous/);
 const duplicateTitle=shape();duplicateTitle.bars[0].directStaticTexts.push(structuredClone(duplicateTitle.bars[0].directStaticTexts[0]));assert.throws(()=>titleContract(s,duplicateTitle),/Ambiguous/);
});
test('nonce entry and picker dismissal use the same title policy; a Browse transition is not successful dismissal',()=>{
 const s=swiftSource();assert(s.includes('while try currentNavigationTitle(app) != folder'));
 assert(s.includes('while try currentNavigationTitle(app) != nil ||'));
 assert(s.includes('find(app, cancelLabels) != nil || find(app, openLabels) != nil'));
 assert.equal(titleContract(s,shape(request.requiredFolderName)),request.requiredFolderName);
 assert.notEqual(titleContract(s,shape('Browse')),null,'still-open Browse cannot masquerade as dismissal');
 const absent=shape();absent.bars=[];assert.equal(titleContract(s,absent),null);
});
test('real provider taps capture a separate frame and bounded title waits preserve original deadlines and no-grant boundary',()=>{
 const s=swiftSource();assert(s.includes('Date().addingTimeInterval(5)'));assert(s.includes('field.waitForExistence(timeout: 5)'));
 assert(s.includes('Date().addingTimeInterval(15)'));assert.equal((s.match(/Date\(\)\.addingTimeInterval\(10\)/g)||[]).length,2);
 assert(s.includes('for attempt in 0..<6'));assert(s.includes('if try waitForNavigationTitle(app, labels)'));
 const tap=s.indexOf('try tap(location, "open-observed-external-local-provider")');
 const capture=s.indexOf('capture("provider-tap-\\(attempt)-\\(canonical)")');
 const wait=s.indexOf('if try waitForNavigationTitle(app, labels)');assert(tap>=0&&tap<capture&&capture<wait);
 assert(s.includes('availability is undetermined and app Documents is forbidden'));
 assert(!s.includes('No real external On My iPhone/iPad provider'));
 assert(!/\.launch\s*\(|\.terminate\s*\(|UserDefaults|bookmarkData|MethodChannel|coordinate\(/.test(s));
});
