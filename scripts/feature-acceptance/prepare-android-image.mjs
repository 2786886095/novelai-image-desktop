import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';

export const ANDROID_IMAGE_PACKAGE='system-images;android-34;google_apis;x86_64';
export const ANDROID_SDK_ROOT='/usr/local/lib/android/sdk';
export const ANDROID_SDKMANAGER=ANDROID_SDK_ROOT+'/cmdline-tools/latest/bin/sdkmanager';
export const ANDROID_IMAGE_DIRECTORY=ANDROID_SDK_ROOT+'/system-images/android-34/google_apis/x86_64';
export const ANDROID_RUNNER_TEMP='/home/runner/work/_temp';
export const ANDROID_IMAGE_MAX_ATTEMPTS=2;
const argv=Object.freeze([ANDROID_SDKMANAGER,'--install',ANDROID_IMAGE_PACKAGE,'--channel=0']);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const knownZipLine=/^Warning: An error occurred while preparing SDK package Google APIs Intel x86_64 Atom System Image: Error on ZipFile unknown archive\.$/;
const errorLine=/\berror\b|exception|\bfailed\b|\bfatal\b|\bfailure\b|\bunknown\b|\binvalid\b|corrupt|malformed|unable|\bcannot\b|unrecognized|unsupported|refused|unavailable|denied|signature|checksum|certificate|\bTLS\b|\bSSL\b|EACCES|EPERM|ENOSPC|no space|not found|not permitted|unauthori|^Warning:/i;
const lines=result=>(String(result.stdout??'')+'\n'+String(result.stderr??''))
  .replace(/\x1b\[[0-9;]*m/g,'').split(/[\r\n]+/).map(line=>line.trim()).filter(Boolean);
const abnormal=result=>result.error||result.timedOut||result.outputOverflow||result.signal||result.cleanupComplete!==true;

export function validateAndroidImageEnvironment(env,hostPlatform) {
  if(hostPlatform!=='linux'||env.GITHUB_ACTIONS!=='true'||(env.RUNNER_OS&&env.RUNNER_OS!=='Linux'))
    throw Error('Android image preparation is restricted to Linux GitHub Actions.');
  if((!env.ANDROID_HOME&&!env.ANDROID_SDK_ROOT)||
    [env.ANDROID_HOME,env.ANDROID_SDK_ROOT].some(value=>value!==undefined&&value!==ANDROID_SDK_ROOT)||
    env.RUNNER_TEMP!==ANDROID_RUNNER_TEMP)throw Error('Only the fixed hosted Linux SDK and RUNNER_TEMP paths are allowed.');
}

// A warning plus any different error/warning is NOT the known retry condition.
// Timeout, spawn failure, overflow and incomplete cleanup always fail closed.
export function isRetryableAndroidZipFailure(result) {
  if(!Number.isInteger(result.exitStatus)||result.exitStatus===0||abnormal(result))return false;
  const output=lines(result);
  return output.some(line=>knownZipLine.test(line))&&
    !output.some(line=>errorLine.test(line)&&!knownZipLine.test(line));
}

function noSymlink(io,file) {
  const relative=path.posix.relative(ANDROID_SDK_ROOT,file);
  if(relative.startsWith('..')||path.posix.isAbsolute(relative))throw Error('Path leaves the fixed SDK root.');
  let current=ANDROID_SDK_ROOT;
  for(const segment of ['',...relative.split('/').filter(Boolean)]) {
    if(segment)current=path.posix.join(current,segment);
    try {if(io.lstatSync(current).isSymbolicLink())throw Error('SDK target must not contain symlinks.');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
function fixedHostPaths(io) {
  if(io.realpathSync(ANDROID_SDK_ROOT)!==ANDROID_SDK_ROOT||io.realpathSync(ANDROID_RUNNER_TEMP)!==ANDROID_RUNNER_TEMP)
    throw Error('SDK/temp real paths must equal the fixed hosted paths.');
  noSymlink(io,ANDROID_SDKMANAGER);noSymlink(io,ANDROID_IMAGE_DIRECTORY);
  if(!io.statSync(ANDROID_SDKMANAGER).isFile())throw Error('Fixed sdkmanager is not a file.');
  io.accessSync(ANDROID_SDKMANAGER,fs.constants.X_OK);
}
function metadataFile(io,name) {
  const file=path.posix.join(ANDROID_IMAGE_DIRECTORY,name);noSymlink(io,file);
  const stat=io.statSync(file);
  if(!stat.isFile()||stat.size<=0||stat.size>1024*1024)throw Error('Missing or oversized installed metadata: '+name);
  const bytes=io.readFileSync(file);
  return {file,bytes,sha256:hash(bytes)};
}
export function verifyInstalledAndroidImage(io=fs) {
  const xml=metadataFile(io,'package.xml'),properties=metadataFile(io,'source.properties');
  const text=xml.bytes.toString('utf8');
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('External XML declarations are forbidden.');
  const packages=[...text.matchAll(/<localPackage\b[^>]*\bpath=["']([^"']+)["'][^>]*>([\s\S]*?)<\/localPackage>/g)];
  if(packages.length!==1||packages[0][1]!==ANDROID_IMAGE_PACKAGE||
    !/<api-level>\s*34\s*<\/api-level>/.test(packages[0][2])||
    !/<abi>\s*x86_64\s*<\/abi>/.test(packages[0][2])||
    !/<tag>\s*<id>\s*google_apis\s*<\/id>/.test(packages[0][2]))throw Error('Installed package.xml identity does not match the fixed image.');
  const props=new Map();
  for(const line of properties.bytes.toString('utf8').split(/\r?\n/)) {
    const match=/^\s*([^#!\s][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if(match){if(props.has(match[1]))throw Error('Duplicate installed property.');props.set(match[1],match[2]);}
  }
  for(const [key,value] of [['AndroidVersion.ApiLevel','34'],['SystemImage.Abi','x86_64'],['SystemImage.TagId','google_apis']])
    if(props.get(key)!==value)throw Error('Installed source.properties mismatch: '+key);
  if(props.has('Pkg.Path')&&props.get('Pkg.Path')!==ANDROID_IMAGE_PACKAGE)throw Error('Installed Pkg.Path mismatch.');
  const images=['system.img','ramdisk.img','kernel-ranchu'].map(name=>{
    const file=path.posix.join(ANDROID_IMAGE_DIRECTORY,name);noSymlink(io,file);const stat=io.statSync(file);
    if(!stat.isFile()||stat.size<=0)throw Error('Installed image is missing or empty: '+name);
    return {file,bytes:stat.size};
  });
  return {package:ANDROID_IMAGE_PACKAGE,metadata:[xml,properties].map(({file,bytes,sha256})=>({file,bytes:bytes.length,sha256})),images};
}

// Dependency injection exists only for pure host tests. The CLI has no package,
// path, platform, command or attempt override and always uses the bounded runner.
export function createAndroidImagePreparer({io=fs,command=runBoundedNativeCommand,hostPlatform=process.platform}={}) {
  return async function prepare(env=process.env) {
    validateAndroidImageEnvironment(env,hostPlatform);
    fixedHostPaths(io);
    const output=io.mkdtempSync(ANDROID_RUNNER_TEMP+'/android-image-preparation-');
    const report={kind:'android-sdk-image-preparation',package:ANDROID_IMAGE_PACKAGE,sdkmanager:ANDROID_SDKMANAGER,
      output,attemptLimit:ANDROID_IMAGE_MAX_ATTEMPTS,attempts:[],exitStatus:1,installed:null,failure:null,
      productNativePass:false,full195Certified:false,bootGatesUnchanged:true,sdkPathsDeleted:[]};
    try {
      for(let attempt=1;attempt<=ANDROID_IMAGE_MAX_ATTEMPTS;attempt++) {
        let result;
        try {result=await command([...argv],{cwd:ANDROID_RUNNER_TEMP,env,timeout:600000,killGrace:1000,drainGrace:1000,maxBuffer:16*1024*1024});}
        catch(error){result={stdout:'',stderr:'',exitStatus:null,error:error.stack||String(error),cleanupComplete:false};}
        const record={attempt,...result,command:[...argv]};
        for(const stream of ['stdout','stderr']) {
          const file=path.posix.join(output,`attempt-${attempt}.${stream}.txt`),bytes=Buffer.from(String(result[stream]??''),'utf8');
          io.writeFileSync(file,bytes);record[stream+'File']={file,bytes:bytes.length,sha256:hash(bytes)};
        }
        report.attempts.push(record);
        io.writeFileSync(path.posix.join(output,`attempt-${attempt}.json`),JSON.stringify(record,null,2)+'\n');
        if(result.exitStatus===0&&!abnormal(result)&&!lines(result).some(line=>errorLine.test(line))) {
          report.installed=verifyInstalledAndroidImage(io);report.exitStatus=0;break;
        }
        if(attempt===ANDROID_IMAGE_MAX_ATTEMPTS||!isRetryableAndroidZipFailure(result))
          throw Error('Fixed Android image installation failed; see literal command evidence.');
      }
    } catch(error){report.failure=error.stack||String(error);report.exitStatus=1;}
    const file=path.posix.join(output,'REPORT.json');
    io.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
    if(io.readFileSync(file,'utf8')!==JSON.stringify(report,null,2)+'\n')throw Error('Android preparation report readback differs.');
    return report;
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if(process.argv.length!==2)throw Error('Android image preparation accepts no path/package overrides.');
    const report=await createAndroidImagePreparer()();
    console.log('ANDROID_IMAGE_PREPARATION '+JSON.stringify({output:report.output,exitStatus:report.exitStatus,attempts:report.attempts.length,productNativePass:false}));
    process.exitCode=report.exitStatus;
  } catch(error){console.error(error.stack||String(error));process.exitCode=1;}
}
