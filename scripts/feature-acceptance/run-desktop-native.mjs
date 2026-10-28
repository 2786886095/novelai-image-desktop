import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deps = path.join(sourceRoot, 'node_modules');
const platform = ({win32:'windows',darwin:'macos',linux:'linux'})[process.platform];
if (!platform) throw new Error('Not a desktop native host.');
const outputRoot = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'native-desktop-acceptance-')));
const sourceSha = process.argv[3] || 'uncommitted';
if (sourceSha !== 'uncommitted' && !/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error('Invalid source SHA.');
const run = path.join(outputRoot, crypto.randomUUID());
fs.mkdirSync(run, {recursive:true});
const req = createRequire(path.join(sourceRoot, 'package.json'));
const ledger = [];
function command(argv, timeout=300000) {
  const env = {...process.env};
  for (const name of ['ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','PORTABLE_EXECUTABLE_DIR','PORTABLE_EXECUTABLE_FILE']) delete env[name];
  const result = spawnSync(argv[0], argv.slice(1), {cwd:run,env,windowsHide:true,encoding:'utf8',timeout,maxBuffer:80*1024*1024});
  const record = {command:argv,cwd:run,stdout:result.stdout??'',stderr:result.stderr??'',exitStatus:result.status,error:result.error?.message??null};
  ledger.push(record); fs.writeFileSync(path.join(run,'command-ledger.json'), JSON.stringify(ledger,null,2)+'\n');
  process.stdout.write(record.stdout); process.stderr.write(record.stderr);
  return record;
}
let exitStatus=1, checks=[];
try {
  const config=JSON.parse(fs.readFileSync(path.join(sourceRoot,'tsconfig.electron.json'),'utf8'));
  config.compilerOptions.outDir=path.join(run,'compiled');
  config.compilerOptions.rootDir=sourceRoot;
  config.compilerOptions.typeRoots=[path.join(deps,'@types')];
  config.include=[...config.include,'src/favorites-view.ts'].map(p=>path.join(sourceRoot,p));
  config.exclude=config.exclude.map(p=>path.join(sourceRoot,p));
  const configFile=path.join(run,'compile.json'); fs.writeFileSync(configFile,JSON.stringify(config,null,2));
  const compiled=command([process.execPath,path.join(deps,'typescript/bin/tsc'),'-p',configFile]);
  if(compiled.exitStatus!==0) throw new Error('Production native source compilation failed.');
  fs.symlinkSync(deps,path.join(run,'compiled/node_modules'),process.platform==='win32'?'junction':'dir');
  fs.writeFileSync(path.join(run,'SETUP.json'),JSON.stringify({sourceSha,compiled:path.join(run,'compiled'),deps},null,2));
  const target=path.join(run,'desktop-journeys.cjs');fs.copyFileSync(path.join(sourceRoot,'scripts/feature-acceptance/desktop-journeys.cjs'),target);
  const electronCommand=process.platform==='linux'?[req('electron'),'--password-store=gnome-libsecret',target]:[req('electron'),target];
  const actual=process.platform==='linux'?command(electronCommand,120000):command(electronCommand);
  const report=JSON.parse(fs.readFileSync(path.join(run,'NATIVE_CORE_REPORT.json'),'utf8'));
  if(actual.exitStatus!==0||report.platform!==process.platform||report.passed!==16||report.total!==16||report.mockedModules!==false) throw new Error('Native desktop journey incomplete or wrong runtime.');
  for(const item of report.cases){
    const feature=item.name.startsWith('favorites.')?'favorites':item.name.includes('convert')?'convert':item.name.includes('reverse')?'reverse':'settings';
    checks.push({sourceSha,feature,platform,kind:'integration',journey:item.name,observed:item.observed,
      command:actual.command,stdout:actual.stdout,stderr:actual.stderr,exitStatus:actual.exitStatus,skipped:false,
      acceptanceLevel:'component-only',scope:'Real native Electron production modules and filesystem/loopback; no complete feature certification.'});
  }
  exitStatus=0;
}catch(error){process.stderr.write((error.stack||String(error))+'\n');}
finally{
  const target=path.join(outputRoot,`desktop-${platform}-receipt.json`);
  const value={sourceSha,platform,run,checks,ledger,exitStatus,completeFeatureRowsCertified:0,full195Certified:false,boundary:'No paid call, human profile, release publication, or inference about another target platform.'};
  fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n');const bytes=fs.readFileSync(target);
  console.log(`RECEIPT ${target} BYTES=${bytes.length} SHA256=${crypto.createHash('sha256').update(bytes).digest('hex')} CHECKS=${checks.length} EXIT=${exitStatus}`);
  const evidenceNames=[path.basename(target),...['command-ledger.json','NATIVE_CORE_REPORT.json','SETUP.json','desktop-journeys.cjs','compile.json'].map(name=>path.posix.join(path.basename(run),name))];
  const evidenceFiles=[],missingFiles=[];
  for(const relativeFile of evidenceNames){
    const file=path.join(outputRoot,...relativeFile.split('/'));
    if(!fs.existsSync(file)){missingFiles.push(relativeFile);continue;}
    const data=fs.readFileSync(file);
    evidenceFiles.push({file:relativeFile,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
  }
  const evidenceManifest=path.join(outputRoot,'EVIDENCE_MANIFEST.json');
  fs.writeFileSync(evidenceManifest,JSON.stringify({sourceSha,platform,exitStatus,files:evidenceFiles,missingFiles,completeFeatureRowsCertified:0,full195Certified:false},null,2)+'\n');
  const evidenceManifestBytes=fs.readFileSync(evidenceManifest);
  console.log('EVIDENCE_MANIFEST '+evidenceManifest+' BYTES='+evidenceManifestBytes.length+' SHA256='+crypto.createHash('sha256').update(evidenceManifestBytes).digest('hex'));
  process.exitCode=exitStatus;
}
