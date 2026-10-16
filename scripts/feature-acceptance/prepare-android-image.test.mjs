import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  ANDROID_IMAGE_PACKAGE,ANDROID_SDK_ROOT,ANDROID_SDKMANAGER,ANDROID_IMAGE_DIRECTORY,ANDROID_RUNNER_TEMP,
  createAndroidImagePreparer,isRetryableAndroidZipFailure,verifyInstalledAndroidImage,validateAndroidImageEnvironment,
} from './prepare-android-image.mjs';

const zipWarning='Warning: An error occurred while preparing SDK package Google APIs Intel x86_64 Atom System Image: Error on ZipFile unknown archive.\n';
const env=()=>({GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',ANDROID_HOME:ANDROID_SDK_ROOT,ANDROID_SDK_ROOT,RUNNER_TEMP:ANDROID_RUNNER_TEMP});
const result=(patch={})=>({stdout:'Installing system images.\n',stderr:'',exitStatus:0,error:null,timedOut:false,outputOverflow:false,signal:null,cleanupComplete:true,...patch});
// Every virtual Linux path maps into this one new temporary host directory.
// There is no real SDK access and the injected command never spawns sdkmanager.
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'android-image-unit-')),reads=[],writes=[],commands=[];
  const roots=[[ANDROID_SDK_ROOT,path.join(root,'sdk')],[ANDROID_RUNNER_TEMP,path.join(root,'runner-temp')]];
  const real=file=>{
    assert.equal(typeof file,'string');
    for(const [virtual,actual] of roots)if(file===virtual||file.startsWith(virtual+'/')){
      const target=path.resolve(actual,...path.posix.relative(virtual,file).split('/'));
      assert(!path.relative(actual,target).startsWith('..'));return target;
    }
    throw Error('Forbidden non-fixture path: '+file);
  };
  const virtual=file=>{for(const [v,a] of roots)if(file===a||file.startsWith(a+path.sep))return path.posix.join(v,...path.relative(a,file).split(path.sep));return file;};
  for(const [,actual]of roots)fs.mkdirSync(actual,{recursive:true});
  fs.mkdirSync(path.dirname(real(ANDROID_SDKMANAGER)),{recursive:true});fs.writeFileSync(real(ANDROID_SDKMANAGER),'PURE UNIT COMMAND STUB - NOT SDKMANAGER');
  const io={
    realpathSync:f=>{reads.push(f);return virtual(fs.realpathSync(real(f)));},
    lstatSync:f=>{reads.push(f);return fs.lstatSync(real(f));},
    statSync:f=>{reads.push(f);return fs.statSync(real(f));},
    accessSync:(f,m)=>{reads.push(f);return fs.accessSync(real(f),m);},
    readFileSync:(f,e)=>{reads.push(f);return fs.readFileSync(real(f),e);},
    writeFileSync:(f,b)=>{assert(f.startsWith(ANDROID_RUNNER_TEMP+'/'));writes.push(f);fs.writeFileSync(real(f),b);},
    mkdtempSync:f=>{assert(f.startsWith(ANDROID_RUNNER_TEMP+'/android-image-preparation-'));writes.push(f);return virtual(fs.mkdtempSync(real(f)));},
  };
  const install=(patch={})=>{
    fs.mkdirSync(real(ANDROID_IMAGE_DIRECTORY),{recursive:true});
    const xml=`<repository><localPackage path="${ANDROID_IMAGE_PACKAGE}"><type-details><api-level>34</api-level><abi>x86_64</abi><tag><id>google_apis</id></tag></type-details></localPackage></repository>`;
    const properties='AndroidVersion.ApiLevel=34\nSystemImage.Abi=x86_64\nSystemImage.TagId=google_apis\n';
    for(const [name,bytes]of Object.entries({'package.xml':xml,'source.properties':properties,'system.img':'unit image','ramdisk.img':'unit ramdisk','kernel-ranchu':'unit kernel',...patch}))
      if(bytes!==null)fs.writeFileSync(real(path.posix.join(ANDROID_IMAGE_DIRECTORY,name)),bytes);
  };
  const run=async(answers,{environment=env(),hostPlatform='linux',onCall}={})=>createAndroidImagePreparer({io,hostPlatform,command:async(argv,options)=>{
    commands.push({argv,options});if(onCall)onCall(commands.length);const value=answers[commands.length-1];assert(value,'Unexpected extra attempt');return value;
  }})(environment);
  return{root,io,real,install,run,reads,writes,commands,close(){assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}};
}

test('only Linux GitHub Actions, fixed SDK roots and exact RUNNER_TEMP pass admission',()=>{
  validateAndroidImageEnvironment(env(),'linux');
  for(const [hostPlatform,patch]of [['win32',{}],['darwin',{}],['linux',{GITHUB_ACTIONS:'false'}],['linux',{GITHUB_ACTIONS:undefined}],['linux',{RUNNER_OS:'Windows'}],['linux',{ANDROID_HOME:'/tmp/sdk'}],['linux',{ANDROID_SDK_ROOT:'/tmp/sdk'}],['linux',{RUNNER_TEMP:'/tmp'}],['linux',{ANDROID_HOME:undefined,ANDROID_SDK_ROOT:undefined}]])
    assert.throws(()=>validateAndroidImageEnvironment({...env(),...patch},hostPlatform));
});

test('invalid environments fail before any SDK/temp IO or command',async()=>{
  for(const patch of [{GITHUB_ACTIONS:'false'},{ANDROID_HOME:'/human/sdk'},{RUNNER_TEMP:'/human/profile'}]){
    const f=fixture();try{await assert.rejects(f.run([],{environment:{...env(),...patch}}));assert.deepEqual(f.reads,[]);assert.deepEqual(f.writes,[]);assert.deepEqual(f.commands,[]);}finally{f.close();}
  }
});

test('a first success needs real installed metadata and all image files; exact outputs and exit are recorded',async()=>{
  const f=fixture();try{
    const raw=result({stdout:'literal stdout \u4e2d\u6587\n',stderr:'literal stderr diagnostic\n'});
    const r=await f.run([raw],{onCall:()=>f.install()});
    assert.equal(r.exitStatus,0);assert.equal(r.attempts.length,1);assert.equal(r.installed.package,ANDROID_IMAGE_PACKAGE);
    assert.deepEqual(f.commands[0].argv,[ANDROID_SDKMANAGER,'--install',ANDROID_IMAGE_PACKAGE,'--channel=0']);
    assert.equal(f.commands[0].options.timeout,600000);assert.equal(f.commands[0].options.killGrace,1000);assert.equal(f.commands[0].options.drainGrace,1000);
    assert.equal(fs.readFileSync(f.real(r.attempts[0].stdoutFile.file),'utf8'),raw.stdout);
    assert.equal(fs.readFileSync(f.real(r.attempts[0].stderrFile.file),'utf8'),raw.stderr);
    assert.equal(r.attempts[0].exitStatus,0);assert.equal(r.productNativePass,false);assert.equal(r.full195Certified,false);assert.deepEqual(r.sdkPathsDeleted,[]);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.real(r.output+'/REPORT.json'),'utf8')),r);
    assert(f.writes.every(p=>p.startsWith(ANDROID_RUNNER_TEMP+'/')));
  }finally{f.close();}
});

test('only the exact observed ZIP failure permits one same-package retry',async()=>{
  const f=fixture();try{
    const first=result({exitStatus:1,stderr:zipWarning});
    assert.equal(isRetryableAndroidZipFailure(first),true);
    const r=await f.run([first,result()],{onCall:n=>{if(n===2)f.install();}});
    assert.equal(r.exitStatus,0);assert.equal(r.attempts.length,2);assert.deepEqual(f.commands[0].argv,f.commands[1].argv);
    assert.equal(r.attempts[0].stderr,zipWarning);assert.equal(r.attempts[0].exitStatus,1);assert.equal(r.attempts[1].exitStatus,0);
  }finally{f.close();}
});

test('two exact ZIP failures are a terminal failure, never a third installation',async()=>{
  const f=fixture();try{const r=await f.run([result({exitStatus:1,stderr:zipWarning}),result({exitStatus:1,stderr:zipWarning})]);
    assert.equal(r.exitStatus,1);assert.equal(f.commands.length,2);assert.equal(r.installed,null);assert(r.failure);
  }finally{f.close();}
});

test('unknown, signature, permission, transport, timeout and mixed errors never retry',async()=>{
  for(const patch of [{exitStatus:1,stderr:'Unknown package\n'},{exitStatus:1,stderr:'Signature verification failed\n'},
    {exitStatus:1,stderr:'Permission denied\n'},{exitStatus:1,stderr:zipWarning+'Error: unknown failure\n'},
    {exitStatus:1,stderr:zipWarning+'Invalid package\n'},
    {exitStatus:1,stderr:zipWarning+'Warning: certificate verification failed\n'},
    {exitStatus:124,stderr:zipWarning,timedOut:true},{exitStatus:125,stderr:zipWarning,outputOverflow:true},
    {exitStatus:null,stderr:zipWarning,error:'spawn ENOENT'},{exitStatus:1,stderr:zipWarning,cleanupComplete:false},
    {exitStatus:1,stderr:zipWarning,signal:'SIGTERM'}]){
    const f=fixture();try{assert.equal(isRetryableAndroidZipFailure(result(patch)),false);const r=await f.run([result(patch)]);assert.equal(r.exitStatus,1);assert.equal(f.commands.length,1);}finally{f.close();}
  }
});

test('exit zero with missing, wrong or partial installed metadata cannot pass or retry',async()=>{
  const setups=[()=>{},f=>f.install({'package.xml':null}),f=>f.install({'source.properties':'AndroidVersion.ApiLevel=35\nSystemImage.Abi=x86_64\nSystemImage.TagId=google_apis\n'}),
    f=>f.install({'package.xml':`<localPackage path="system-images;android-35;google_apis;arm64-v8a"><api-level>35</api-level></localPackage>`}),
    f=>f.install({'system.img':''}),f=>f.install({'kernel-ranchu':null}),
    f=>f.install({'source.properties':'AndroidVersion.ApiLevel=34\nAndroidVersion.ApiLevel=34\nSystemImage.Abi=x86_64\nSystemImage.TagId=google_apis\n'})];
  for(const setup of setups){const f=fixture();try{const r=await f.run([result()],{onCall:()=>setup(f)});assert.equal(r.exitStatus,1);assert.equal(f.commands.length,1);assert(r.failure);}finally{f.close();}}
});

test('an installed metadata symlink or an error printed with exit zero is never accepted',async()=>{
  for(const mode of ['metadata-link','zero-with-error']){
    const f=fixture();try{
      f.install();
      if(mode==='metadata-link'){
        const old=f.io.lstatSync;f.io.lstatSync=file=>file===ANDROID_IMAGE_DIRECTORY+'/package.xml'?{isSymbolicLink:()=>true}:old(file);
      }
      const r=await f.run([result(mode==='zero-with-error'?{stderr:zipWarning}:{})]);
      assert.equal(r.exitStatus,1);assert.equal(f.commands.length,1);assert.equal(r.installed,null);
    }finally{f.close();}
  }
});

test('a second non-ZIP failure retains both streams and never starts a third attempt',async()=>{
  const f=fixture();try{
    const second=result({exitStatus:13,stdout:'second stdout\n',stderr:'Permission denied\n'});
    const r=await f.run([result({exitStatus:1,stderr:zipWarning}),second]);
    assert.equal(r.exitStatus,1);assert.equal(f.commands.length,2);
    assert.equal(r.attempts[1].exitStatus,13);
    assert.equal(fs.readFileSync(f.real(r.attempts[1].stdoutFile.file),'utf8'),second.stdout);
    assert.equal(fs.readFileSync(f.real(r.attempts[1].stderrFile.file),'utf8'),second.stderr);
  }finally{f.close();}
});

test('a final nonzero never passes even if an older installed image exists',async()=>{
  const f=fixture();try{f.install();const r=await f.run([result({exitStatus:7,stderr:'denied\n'})]);assert.equal(r.exitStatus,1);assert.equal(r.installed,null);assert.equal(r.attempts[0].exitStatus,7);}finally{f.close();}
});

test('fixed SDK symlinks are rejected before any command; no SDK deletion APIs exist',async()=>{
  const f=fixture();try{
    // The adapter simulates a link without creating an OS link or reading a real SDK.
    const old=f.io.lstatSync;f.io.lstatSync=file=>file===ANDROID_IMAGE_DIRECTORY?{isSymbolicLink:()=>true}:old(file);
    await assert.rejects(f.run([]),/symlinks/);assert.equal(f.commands.length,0);assert.deepEqual(f.writes,[]);
    assert.equal(f.io.rmSync,undefined);assert.equal(f.io.unlinkSync,undefined);assert.equal(f.io.renameSync,undefined);
  }finally{f.close();}
});

test('missing installed metadata verifier is strict and CLI cannot select another package or SDK',()=>{
  const f=fixture();try{assert.throws(()=>verifyInstalledAndroidImage(f.io));}finally{f.close();}
  const file=fileURLToPath(new URL('./prepare-android-image.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[file,'--sdk-root=/human/sdk'],{env:{...process.env,GITHUB_ACTIONS:'true'},encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(child.status,1);assert.match(child.stderr,/no path\/package overrides/);assert.equal(child.stdout,'');
});
