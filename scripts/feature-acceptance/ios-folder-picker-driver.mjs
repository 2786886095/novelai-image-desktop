// Disposable Simulator UI support only. This driver is NOT native acceptance:
// Dart independently requires the real bookmark, external bytes and history.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';
import {fileURLToPath} from 'node:url';
import {iosSimulatorLocalePaths,assertIosSimulatorLocaleReadback} from './create-disposable-ios-simulator.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fixture=fileURLToPath(new URL('./fixtures/ios-folder-picker-ui.swift',import.meta.url));
const processFixture=fileURLToPath(new URL('./fixtures/ios-process-identity.c',import.meta.url));
export function iosSimulatorAppPid(stdout,appId){
 if(typeof stdout!=='string'||!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(appId||''))throw Error('Actual launchctl output and fixed bundle ID required');
 const escaped=appId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const label=new RegExp('^UIKitApplication:'+escaped+'\\[[^\\s]+$');
 const matches=stdout.trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length===3&&label.test(parts[2]));
 if(matches.length!==1||!/^\d+$/.test(matches[0][0])||!Number.isSafeInteger(Number(matches[0][0]))||Number(matches[0][0])<1)throw Error('Exactly one running actual Simulator application PID required');return Number(matches[0][0]);
}
export function iosHostProcessIdentity(stdout,nativePid){
 const text=String(stdout).trim();
 if(!/^IOS_PROCESS_IDENTITY:\{[^\r\n]*\}$/.test(text))throw Error('Exactly one actual host libproc observation required');
 const actual=JSON.parse(text.slice('IOS_PROCESS_IDENTITY:'.length));
 if(actual.schemaVersion!==1||actual.observer!=='darwin-libproc'||actual.pid!==nativePid)throw Error('Actual Simulator application PID differs from native BEGIN');
 if(!/^[1-9][0-9]{0,11}$/.test(actual.startSeconds||'')||!Number.isSafeInteger(actual.startMicroseconds)||actual.startMicroseconds<0||actual.startMicroseconds>=1000000)throw Error('Actual process creation identity required');
 return actual;
}
export function iosSimulatorBundleContainer(stdout,simulatorDataPath,device,canonicalize=fs.realpathSync){
 const locale=iosSimulatorLocalePaths(simulatorDataPath,device);
 const raw=typeof stdout==='string'?stdout.trim():'';
 const root=path.posix.join(locale.dataPath,'Containers/Bundle/Application');
 if(!raw||raw.includes('\\')||/[\r\n\0]/.test(raw)||path.posix.normalize(raw)!==raw||!path.posix.isAbsolute(raw))throw Error('Actual Simulator app container path required');
 const relative=path.posix.relative(root,raw).split('/');
 if(relative.length!==2||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(relative[0])||!/^.+\.app$/.test(relative[1]))throw Error('App container is outside the exact Simulator bundle directory');
 const realData=canonicalize(locale.dataPath),realRoot=canonicalize(root),container=canonicalize(raw);
 if(realData!==locale.dataPath||realRoot!==root||container!==raw)throw Error('Aliased or foreign Simulator data/container refused');
 if(path.posix.relative(realRoot,container).split('/').join('/')!==relative.join('/'))throw Error('Aliased or foreign Simulator bundle container refused');
 return container;
}
// Kernel PID/path/birth + booted-device inventory-rooted filesystem metadata.
// This is NOT an independent CoreSimulator installation-registration witness,
// nor source attestation. Fresh build/qualified BEGIN and real native UI/bytes
// proofs remain independently required.
export function iosSimulatorContainerFromProcess(actual,simulatorDataPath,device,canonicalize=fs.realpathSync){
 const file=actual?.executablePath;
 if(typeof file!=='string'||!path.posix.isAbsolute(file)||/[\r\n\0\\]/.test(file)||path.posix.normalize(file)!==file)throw Error('Actual kernel executable path required');
 const container=iosSimulatorBundleContainer(path.posix.dirname(file),simulatorDataPath,device,canonicalize);
 if(!path.posix.basename(file)||canonicalize(file)!==file)throw Error('Aliased kernel executable leaf refused');
 return container;
}
// Bind the actual process to exact filesystem bundle ID/executable, never a PID echo.
export function bindIosSimulatorProcess({processStdout,bundleInfo,device,appId,nativePid,simulatorDataPath},canonicalize=fs.realpathSync){
 if(!Number.isSafeInteger(nativePid)||nativePid<1||nativePid>2147483647||!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(appId||''))throw Error('Fixed actual process/package required');
 const actual=iosHostProcessIdentity(processStdout,nativePid);
 const container=iosSimulatorContainerFromProcess(actual,simulatorDataPath,device,canonicalize);
 if(!bundleInfo||bundleInfo.CFBundleIdentifier!==appId||typeof bundleInfo.CFBundleExecutable!=='string'||!bundleInfo.CFBundleExecutable||/[\/\\\r\n\0]/.test(bundleInfo.CFBundleExecutable)||['.','..'].includes(bundleInfo.CFBundleExecutable))throw Error('Actual bundle identifier/executable differs');
 const expected=path.posix.join(container,bundleInfo.CFBundleExecutable);
 if(typeof actual.executablePath!=='string'||!path.posix.isAbsolute(actual.executablePath)||/[\r\n\0\\]/.test(actual.executablePath)||path.posix.normalize(actual.executablePath)!==actual.executablePath||canonicalize(expected)!==expected||canonicalize(actual.executablePath)!==expected)throw Error('Actual host process executable differs from executing Simulator bundle metadata');
 return{pid:actual.pid,executablePath:expected,startSeconds:actual.startSeconds,startMicroseconds:actual.startMicroseconds,device,appId,appContainer:container};
}
export function validateIosFolderRequest({request:r,begin:b,sourceSha,profileSha,nativePid,device,appId,isolated,entry}){
 if(isolated!==true||entry!=='ios_folder1'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(device||'')||!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(appId||''))throw Error('Explicit isolated iOS folder entry/Simulator/package required');
 if(!/^[a-f0-9]{40}$/.test(sourceSha||'')||!/^[a-f0-9]{64}$/.test(profileSha||'')||!Number.isSafeInteger(nativePid)||nativePid<1||nativePid>2147483647)throw Error('Actual source/profile/PID required');
 if(!b||b.sourceSha!==sourceSha||b.profileSha!==profileSha||b.platform!=='ios'||b.nativePid!==nativePid||b.testEntry!==entry||b.expectedChecks!==1||b.nativeOnly!==true||b.mockOnly!==false||b.paidCalls!==0||b.kind!=='device')throw Error('Folder request lacks matching actual native BEGIN');
 if(!r||r.sourceSha!==sourceSha||r.profileSha!==profileSha||r.platform!=='ios'||r.nativePid!==nativePid||!new RegExp(`^${nativePid}-[1-9][0-9]{10,19}$`).test(r.nonce||'')||r.requiredFolderName!==`NativeOutput-${r.nonce}`||r.deadlineSeconds!==180)throw Error('Foreign, unbounded or malformed iOS folder request');
 return r.requiredFolderName;
}
export function assertIosPickerUiResult(stdout,bindings){
 const packets=[...stdout.matchAll(/IOS_FOLDER_PICKER_UI_RESULT:(\{[^\r\n]*\})/g)].map(m=>JSON.parse(m[1]));
 if(packets.length!==1)throw Error('Exactly one actual XCTest UI result is required');const p=packets[0],r=bindings.request;
 for(const [key,value]of Object.entries({sourceSha:bindings.sourceSha,profileSha:bindings.profileSha,nativePid:bindings.nativePid,nonce:r.nonce,requiredFolderName:r.requiredFolderName,appId:bindings.appId}))if(p[key]!==value)throw Error('XCTest UI result identity differs: '+key);
 if(p.actualSystemPicker!==true||p.createdExactNonceFolder!==true||p.confirmedSelection!==true||p.targetAppNotLaunchedOrTerminated!==true||!['On My iPhone','On My iPad'].includes(p.localProvider))throw Error('Real external-provider UI actions were not completed');
 if(!Array.isArray(p.actions)||p.actions.some(a=>!a||typeof a.action!=='string'||typeof a.label!=='string'||typeof a.identifier!=='string')||!['new-folder-via-system-picker','create-exact-nonce-folder','confirm-system-directory-selection'].every(action=>p.actions.some(a=>a.action===action)))throw Error('Real UI action trace is incomplete');return p;
}

// A standalone UI-test runner has no app-host target and never builds/patches
// Runner. XCUIApplication(bundleIdentifier:) addresses the already running app.
export function iosPickerProject(){return `// !$*UTF8*$!
{archiveVersion=1;classes={};objectVersion=56;objects={
A00000000000000000000001={isa=PBXBuildFile;fileRef=A00000000000000000000002;};
A00000000000000000000002={isa=PBXFileReference;lastKnownFileType=sourcecode.swift;path=FolderPickerUITests.swift;sourceTree="<group>";};
A00000000000000000000003={isa=PBXFileReference;explicitFileType=wrapper.cfbundle;includeInIndex=0;path=FolderPickerUITests.xctest;sourceTree=BUILT_PRODUCTS_DIR;};
A00000000000000000000004={isa=PBXGroup;children=(A00000000000000000000002,A00000000000000000000005);sourceTree="<group>";};
A00000000000000000000005={isa=PBXGroup;children=(A00000000000000000000003);name=Products;sourceTree="<group>";};
A00000000000000000000006={isa=PBXSourcesBuildPhase;buildActionMask=2147483647;files=(A00000000000000000000001);runOnlyForDeploymentPostprocessing=0;};
A00000000000000000000007={isa=PBXFrameworksBuildPhase;buildActionMask=2147483647;files=();runOnlyForDeploymentPostprocessing=0;};
A00000000000000000000008={isa=PBXResourcesBuildPhase;buildActionMask=2147483647;files=();runOnlyForDeploymentPostprocessing=0;};
A00000000000000000000009={isa=PBXNativeTarget;buildConfigurationList=A00000000000000000000012;buildPhases=(A00000000000000000000006,A00000000000000000000007,A00000000000000000000008);buildRules=();dependencies=();name=FolderPickerUITests;productName=FolderPickerUITests;productReference=A00000000000000000000003;productType="com.apple.product-type.bundle.ui-testing";};
A00000000000000000000010={isa=PBXProject;attributes={LastUpgradeCheck=1600;TargetAttributes={A00000000000000000000009={CreatedOnToolsVersion=16.0;};};};buildConfigurationList=A00000000000000000000013;compatibilityVersion="Xcode 14.0";developmentRegion=en;hasScannedForEncodings=0;knownRegions=(en,Base);mainGroup=A00000000000000000000004;productRefGroup=A00000000000000000000005;projectDirPath="";projectRoot="";targets=(A00000000000000000000009);};
A00000000000000000000011={isa=XCBuildConfiguration;buildSettings={SDKROOT=iphonesimulator;IPHONEOS_DEPLOYMENT_TARGET=15.0;SWIFT_VERSION=5.0;CLANG_ENABLE_MODULES=YES;ENABLE_USER_SCRIPT_SANDBOXING=YES;};name=Debug;};
A00000000000000000000012={isa=XCConfigurationList;buildConfigurations=(A00000000000000000000014);defaultConfigurationIsVisible=0;defaultConfigurationName=Debug;};
A00000000000000000000013={isa=XCConfigurationList;buildConfigurations=(A00000000000000000000011);defaultConfigurationIsVisible=0;defaultConfigurationName=Debug;};
A00000000000000000000014={isa=XCBuildConfiguration;buildSettings={PRODUCT_NAME="$(TARGET_NAME)";PRODUCT_BUNDLE_IDENTIFIER=com.langbai.acceptance.FolderPickerUITests;GENERATE_INFOPLIST_FILE=YES;SDKROOT=iphonesimulator;SUPPORTED_PLATFORMS=iphonesimulator;IPHONEOS_DEPLOYMENT_TARGET=15.0;SWIFT_VERSION=5.0;TARGETED_DEVICE_FAMILY="1,2";TEST_TARGET_NAME="";USES_XCTRUNNER=YES;ENABLE_TESTING_SEARCH_PATHS=YES;LD_RUNPATH_SEARCH_PATHS="$(inherited) @executable_path/Frameworks @loader_path/Frameworks";CODE_SIGNING_ALLOWED=NO;ENABLE_USER_SCRIPT_SANDBOXING=YES;};name=Debug;};
};rootObject=A00000000000000000000010;}
`;}
export const iosPickerScheme=`<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="NO" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="A00000000000000000000009" BuildableName="FolderPickerUITests.xctest" BlueprintName="FolderPickerUITests" ReferencedContainer="container:FolderPicker.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.PosixSpawn" shouldUseLaunchSchemeArgsEnv="NO"><Testables><TestableReference skipped="NO" parallelizable="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="A00000000000000000000009" BuildableName="FolderPickerUITests.xctest" BlueprintName="FolderPickerUITests" ReferencedContainer="container:FolderPicker.xcodeproj"/></TestableReference></Testables></TestAction></Scheme>`;

// Reuse the independently tested process-group/descendant-pipe boundary.
const asyncCommand=(argv,{cwd,env,timeout})=>runBoundedNativeCommand(argv,{cwd,env,timeout,killGrace:1000,drainGrace:1000,maxBuffer:40*1024*1024});

export async function prepareIosFolderPickerDriver(options){
 const {outputRoot,command,device,sourceRoot,sourceSha,profileSha,appId,environment=process.env}=options;
 if(process.platform!=='darwin'||environment.GITHUB_ACTIONS!=='true'||options.isolated!==true||options.entry!=='ios_folder1')throw Error('Real isolated macOS CI Simulator is required');
 const temp=fs.realpathSync(environment.RUNNER_TEMP),out=path.resolve(outputRoot),rel=path.relative(temp,out);
 if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||out===path.resolve(sourceRoot)||out.startsWith(path.resolve(sourceRoot)+path.sep))throw Error('External runner temporary output is mandatory');
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(device||''))throw Error('Fixed Simulator UDID required');
 const run=(argv,timeout=120000)=>{const r=command(argv,sourceRoot,timeout);if(r.exitStatus!==0||r.error)throw Error('iOS UI preparation failed: '+JSON.stringify(argv));return r.stdout};
 const devices=JSON.parse(run(['xcrun','simctl','list','devices','booted','--json']));const actual=Object.values(devices.devices??{}).flat().filter(d=>d.udid===device&&d.isAvailable===true&&d.state==='Booted');if(actual.length!==1)throw Error('Actual disposable booted Simulator not found');
 const locale=iosSimulatorLocalePaths(actual[0].dataPath,device);
 const actualLanguages=JSON.parse(run(['/usr/bin/plutil','-extract','AppleLanguages','json','-o','-',locale.file]));const actualLocale=run(['/usr/bin/plutil','-extract','AppleLocale','raw','-o','-',locale.file]).trim();
 assertIosSimulatorLocaleReadback(actualLanguages,actualLocale);
 const root=path.join(out,'ios-picker-host');fs.mkdirSync(root);const project=path.join(root,'FolderPicker.xcodeproj');fs.mkdirSync(path.join(project,'xcshareddata','xcschemes'),{recursive:true});
 fs.writeFileSync(path.join(project,'project.pbxproj'),iosPickerProject());fs.writeFileSync(path.join(project,'xcshareddata','xcschemes','FolderPickerUITests.xcscheme'),iosPickerScheme);fs.copyFileSync(fixture,path.join(root,'FolderPickerUITests.swift'));
 const processSource=path.join(root,'ios-process-identity.c'),processObserver=path.join(root,'ios-process-identity');fs.copyFileSync(processFixture,processSource);
 run(['xcrun','--sdk','macosx','clang','-std=c11','-Wall','-Wextra','-Werror','-O2',processSource,'-lproc','-o',processObserver],30000);
 if(!fs.statSync(processObserver).isFile()||fs.statSync(processObserver).size<=0)throw Error('Fresh host process observer binary missing');
 run(['xcodebuild','build-for-testing','-project',project,'-scheme','FolderPickerUITests','-configuration','Debug','-sdk','iphonesimulator','-destination','id='+device,'-derivedDataPath',path.join(root,'DerivedData'),'CODE_SIGNING_ALLOWED=NO'],300000);
 const products=path.join(root,'DerivedData','Build','Products');const tests=fs.readdirSync(products).filter(n=>n.endsWith('.xctestrun'));if(tests.length!==1)throw Error('Exactly one freshly built XCTest configuration required');
 return createIosFolderPickerObserver({...options,root,products,testRun:tests[0],locale,actualLanguages,actualLocale,processObserver});
}

// Keep draining Flutter machine events while real OS commands run. The factory
// is exported for host process regressions, not as device acceptance evidence.
export function createIosFolderPickerObserver(options,{execute=asyncCommand,now=Date.now,canonicalize=fs.realpathSync}={}){
 const {sourceSha,profileSha,appId,device,environment=process.env,root,products,testRun,locale,actualLanguages,actualLocale,processObserver}=options;
 let begin=null,request=null,promise=null,result=null,firstError=null;
 const observations=[];let observedPidBefore=null,observedPidAfter=null,processIdentityBefore=null,processIdentityAfter=null,requestDeadline=null;
 const remaining=()=>{if(firstError)throw firstError;const value=requestDeadline-now();if(value<=0)throw Error('Overall iOS system-picker deadline exceeded');return value;};
 const checked=async(argv,timeout,file,env=environment)=>{
  const r=await execute(argv,{cwd:root,env,timeout});observations.push(r);
  fs.writeFileSync(path.join(root,file),JSON.stringify(r,null,2));
  if(r.exitStatus!==0||r.error||!r.cleanupComplete||r.signal!==null||r.timedOut||r.outputOverflow)throw Error('Actual iOS picker command failed: '+JSON.stringify(argv)+'; '+(r.error||r.signal||r.exitStatus));
  return r;
 };
 const observePid=async phase=>{
  // All three real queries SHARE the previous5s phase budget, not5s each.
  const phaseDeadline=now()+Math.min(5000,remaining());
  const budget=()=>{const value=Math.min(phaseDeadline-now(),remaining());if(value<=0)throw Error('iOS process observation phase exceeded5000ms');return value;};
  if(typeof processObserver!=='string'||!path.isAbsolute(processObserver)||path.dirname(processObserver)!==root)throw Error('Prepared external host process observer required');
  const proc=await checked([processObserver,String(begin.nativePid)],budget(),'PID_COMMAND_'+phase+'.json');
  iosHostProcessIdentity(proc.stdout,begin.nativePid);
  // Never ask CoreSimulator RPC while the resident app presents its picker.
  // Derive anew from the actual kernel path in THIS observation, not a cache.
  const data=iosSimulatorLocalePaths(locale?.dataPath,device).dataPath;
  const appPath=iosSimulatorContainerFromProcess(iosHostProcessIdentity(proc.stdout,begin.nativePid),data,device,canonicalize);
  const infoPath=path.posix.join(appPath,'Info.plist');
  if(canonicalize(infoPath)!==infoPath)throw Error('Aliased bundle Info.plist leaf refused');
  const info=await checked(['/usr/bin/plutil','-convert','json','-o','-',infoPath],budget(),'APP_INFO_'+phase+'.json');
  const bundleInfo=JSON.parse(info.stdout);
  const identity=bindIosSimulatorProcess({processStdout:proc.stdout,bundleInfo,device,appId,nativePid:begin.nativePid,simulatorDataPath:data},canonicalize);
  // Close the metadata interval with another real read by the unchanged C tool.
  const confirm=await checked([processObserver,String(begin.nativePid)],budget(),'PID_CONFIRM_'+phase+'.json');
  const confirmed=bindIosSimulatorProcess({processStdout:confirm.stdout,bundleInfo,device,appId,nativePid:begin.nativePid,simulatorDataPath:data},canonicalize);
  if(JSON.stringify(confirmed)!==JSON.stringify(identity))throw Error('Actual Simulator process changed during bundle identity observation');
  budget();
  if(phase==='BEFORE')processIdentityBefore=identity;else processIdentityAfter=identity;
  return identity.pid;
 };

 function onLine(text){
  const bm=/FEATURE_ACCEPTANCE_BEGIN:(\{[^\r\n]*\})/.exec(text);if(bm){if(begin)throw Error('Duplicate native BEGIN for iOS picker');begin=JSON.parse(bm[1]);}
  const rm=/NATIVE_FOLDER_PICKER_REQUEST:(\{[^\r\n]*\})/.exec(text);if(!rm)return;
  if(request)throw Error('Repeated iOS picker request');request=JSON.parse(rm[1]);requestDeadline=now()+160000;
  // Establish the only task before validation/PID I/O so failure is never
  // relabelled as an absent request by finish(). No retry or PID/UI bypass.
  promise=Promise.resolve().then(async()=>{
   validateIosFolderRequest({...options,sourceSha,profileSha,begin,nativePid:begin?.nativePid,request});
   observedPidBefore=await observePid('BEFORE');if(observedPidBefore!==begin.nativePid)throw Error('Actual Simulator application PID differs from native BEGIN before picker actions');
   const env={...environment};for(const k of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k))delete env[k];
   const values={STUDIO_SOURCE_SHA:sourceSha,STUDIO_PROFILE_SHA:profileSha,STUDIO_NATIVE_PID:String(begin.nativePid),STUDIO_NONCE:request.nonce,STUDIO_FOLDER_NAME:request.requiredFolderName,STUDIO_APP_ID:appId};for(const[k,v]of Object.entries(values))env['TEST_RUNNER_'+k]=v;
   const argv=['xcodebuild','test-without-building','-xctestrun',path.join(products,testRun),'-destination','id='+device,'-resultBundlePath',path.join(root,'selection.xcresult'),'-testLanguage','en','-testRegion','US','-test-timeouts-enabled','YES','-default-test-execution-time-allowance','120','-maximum-test-execution-time-allowance','150','-parallel-testing-enabled','NO'];
   const uiTimeout=Math.min(140000,remaining()-10000);if(uiTimeout<=0)throw Error('Insufficient remaining real picker UI budget');
   const r=await checked(argv,uiTimeout,'UI_COMMAND.json',env);
   result=assertIosPickerUiResult(r.stdout+'\n'+r.stderr,{sourceSha,profileSha,nativePid:begin.nativePid,request,appId});
   observedPidAfter=await observePid('AFTER');if(observedPidAfter!==begin.nativePid||observedPidAfter!==observedPidBefore||JSON.stringify(processIdentityAfter)!==JSON.stringify(processIdentityBefore))throw Error('Actual Simulator app process changed during system directory selection');
   remaining();fs.writeFileSync(path.join(root,'UI_RESULT.json'),JSON.stringify({supportOnly:true,functionalCertificationGranted:false,observedPidBefore,observedPidAfter,processIdentityBefore,processIdentityAfter,result},null,2));
  }).catch(error=>{firstError||=error;fs.writeFileSync(path.join(root,'OBSERVER_FAILURE.json'),JSON.stringify({requestObserved:true,request,begin,error:String(firstError?.stack||firstError)},null,2));throw firstError;});
  return promise;
 }
 async function finish(){if(firstError)throw firstError;if(!request||!promise)throw Error('Actual native iOS picker request was never observed');await promise;if(!result||observedPidBefore!==begin.nativePid||observedPidAfter!==begin.nativePid)throw Error('Missing validated actual UI/PID result');return{supportOnly:true,functionalCertificationGranted:false,request,result,observedPidBefore,observedPidAfter,processIdentityBefore,processIdentityAfter,processObserverSourceSha256:sha(fs.readFileSync(processFixture)),locale,actualLanguages,actualLocale,commands:observations,fixtureSha256:sha(fs.readFileSync(fixture)),xcresult:path.join(root,'selection.xcresult')};}
 return{onLine,finish,root};
}
