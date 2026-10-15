import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {captureSourceState} from './mobile-entry-workspace.mjs';

const platform=process.argv[2],device=process.argv[3],entry=process.argv[4]||'core19';
const entries={core19:'integration_test/native_feature_journeys.dart',metadata_favorites16:'integration_test/native_metadata_favorites.dart',queue_lifecycle4:'integration_test/native_queue_lifecycle.dart'};
const expectedChecks={core19:19,metadata_favorites16:16,queue_lifecycle4:4};
if(!Object.hasOwn(entries,entry))throw Error('Unknown bounded component entry.');
if(Number(process.argv[6])!==expectedChecks[entry])throw Error('The CI controller must inject the fixed independent expected check count.');
if(!['android','ios'].includes(platform)||!device)throw Error('usage: write-ci-input.mjs android|ios DISPOSABLE_DEVICE');
if(process.env.GITHUB_ACTIONS!=='true')throw Error('This creator is restricted to fresh GitHub runner device jobs.');
const sourceRoot=process.cwd();
const result=spawnSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'});
if(result.status!==0||result.stdout.trim()!==process.env.GITHUB_SHA)throw Error('Actual checkout differs from the requested CI source SHA.');
const outputRoot=path.join(process.env.RUNNER_TEMP,`feature-native-${platform}`,entry);fs.mkdirSync(outputRoot,{recursive:true});
const initialSource=captureSourceState({sourceRoot,sourceSha:result.stdout.trim(),evidenceDirectory:path.join(outputRoot,'source-provenance','input-clean'),requirePristine:true});
const sourceFiles=[];
function walk(dir,relative='mobile'){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['build','.dart_tool','.gradle','key.properties'].includes(entry.name)||/\.(jks|keystore)$/i.test(entry.name))continue;
    const absolute=path.join(dir,entry.name),name=path.posix.join(relative,entry.name);
    if(entry.isDirectory())walk(absolute,name);
    else if(entry.isFile()){const bytes=fs.readFileSync(absolute);sourceFiles.push({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
  }
}
walk(path.join(sourceRoot,'mobile'));sourceFiles.sort((a,b)=>a.path<b.path?-1:1);
const manifest=Buffer.from(JSON.stringify(sourceFiles,null,2)+'\n');fs.writeFileSync(path.join(outputRoot,'native-source-inputs.json'),manifest);
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
const input={platform,device,isolated:true,sourceRoot,projectRoot:path.join(sourceRoot,'mobile'),outputRoot,
  entry,testFile:entries[entry],officialAssetsRoot:process.argv[5],
  expectedChecks:expectedChecks[entry],prepareDependencies:true,dependencyTimeoutMs:300000,
  initialSourceManifest:initialSource.manifest,initialSourcePristine:true,
  appId:platform==='android'?'com.codex.novelai.novelai_mobile':'com.codex.novelai.novelaiMobile',
  flutter:'flutter',adb:sdk?path.join(sdk,'platform-tools','adb'):'adb',androidSdk:sdk,
  javaHome:process.env.JAVA_HOME,sourceSha:result.stdout.trim(),sourceSnapshotSha256:crypto.createHash('sha256').update(manifest).digest('hex'),
  timeoutMs:1500000,journeyTimeoutMs:300000};
const target=path.join(outputRoot,'native-input.json');fs.writeFileSync(target,JSON.stringify(input,null,2)+'\n');
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,`FEATURE_NATIVE_INPUT=${target}\nFEATURE_NATIVE_OUTPUT=${outputRoot}\n`);
console.log(`NATIVE_INPUT=${target} sourceSHA=${input.sourceSha} isolatedDisposableTarget=${device} entry=${entry}`);
