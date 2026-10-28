// Explicit maintainer waiver only. Package provenance, not functional certification.
// Never import or weaken the original verified publisher/feature acceptance gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {assertReleaseArtifactScope,assertUnsignedIosPackage,unsignedIosIpaInspectionPython} from './release-artifact-scope.mjs';
const REPO='2786886095/novelai-image-desktop',VERSION='2.6.8',BUILD='188',TAG='v2.6.8';
const PACKAGE_SHA='76b5d3e08f7171681d0c9ed4d9747e721d9c7c71';
const ACK='PUBLISH_v2.6.8_WITH_MAINTAINER_WAIVER';
const AUTH_SHA='7504698d952adeb8d922397080e24a3c7b481cc958cac2f5c4a71f54ec3516ef';
const SELF='scripts/publish-maintainer-waiver.mjs',WORKFLOW='.github/workflows/publish-maintainer-waiver.yml';
const DOCS=['README.md','README.en.md','README.ja.md','README.ko.md','README.zh-TW.md','docs/RELEASE_NOTES.md'];
const N={setup:`Langbai-NovelAI-Studio-Setup-${VERSION}.exe`,portable:`Langbai-NovelAI-Studio-${VERSION}.exe`,dmg:`Langbai-NovelAI-Studio-${VERSION}-universal.dmg`,mac:`Langbai-NovelAI-Studio-${VERSION}.zip`,linux:`Langbai-NovelAI-Studio-${VERSION}.AppImage`,yaml:'latest.yml',apk:'app-release.apk',ipa:'novelai-mobile-unsigned.ipa'};
const INPUTS=[
 {id:12817977717,run:40692112503,workflow:296765887,name:'novelai-image-desktop-windows',bytes:379243699,sha256:'5686be60bf2d3b7ed9f7773f21435052392f8eb514449e66015258ea52fd534a',wanted:[N.setup,N.portable,N.yaml]},
 {id:12817184744,run:40692112503,workflow:296765887,name:'novelai-image-desktop-macos',bytes:676825981,sha256:'46efd1f6e0a0d3bc5596629ec8133f69a7dc1003e454e61b27ce430059bbf271',wanted:[N.dmg,N.mac]},
 {id:12818185785,run:40692112503,workflow:296765887,name:'novelai-image-desktop-linux',bytes:363742353,sha256:'c3eb9d7b6ea9a53be536abb6a5a5dede9f3d7564b0d2c2eae108e41cdf0bcc35',wanted:[N.linux]},
 {id:12818650055,run:40692117395,workflow:296938219,name:'novelai-mobile-android-apk',bytes:86092354,sha256:'2198adbbb324a784031b282cfce43db311b5b2ff2f53ddfea9a9668e91814326',wanted:[N.apk]},
 {id:12817783335,run:40692117395,workflow:296938219,name:'novelai-mobile-ios-ipa-unsigned',bytes:81931373,sha256:'6c0c48d5b4f33e6f146a46a48b3d47cc670a52b6957e7886e1ed9ea76e6c1e82',wanted:[N.ipa,'ios-package-verification.json']},
];
const call=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024,...options}).trim();
const json=(cmd,args)=>JSON.parse(call(cmd,args));
const git=(...args)=>call('git',args);
const write=(file,obj)=>fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n',{flag:'wx'});
const hashFile=async(file,algorithm='sha256',encoding='hex')=>{const h=crypto.createHash(algorithm);for await(const b of fs.createReadStream(file))h.update(b);return h.digest(encoding);};
const publicUrl=name=>`https://github.com/${REPO}/releases/download/${TAG}/${name}`;
let root,evidence,ownedDraftId=null;
async function api(route,{method='GET',body,allow404=false}={}){
 const url=new URL(route.startsWith('https:')?route:`https://api.github.com/repos/${REPO}/${route}`);
 assert.equal(url.origin,'https://api.github.com');
 const r=await fetch(url,{method,redirect:'error',headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 if(allow404&&r.status===404)return null;
 if(!r.ok)throw Error(`GitHub API ${method} ${url.pathname} returned ${r.status}`);
 return r.status===204?null:r.json();
}
async function all(route){let rows=[];for(let page=1;page<=20;page++){const x=await api(`${route}${route.includes('?')?'&':'?'}per_page=100&page=${page}`);assert(Array.isArray(x));rows.push(...x);if(x.length<100)return rows;}throw Error('Pagination bound exceeded');}
async function peelTag(required){let ref=await api(`git/ref/tags/${TAG}`,{allow404:!required});if(!ref)return null;let o=ref.object;for(let i=0;i<5&&o.type==='tag';i++)o=(await api(`git/tags/${o.sha}`)).object;assert.equal(o.type,'commit');return o.sha;}
const EXTRACT=String.raw`import sys,json,zipfile,stat,os,shutil
from pathlib import Path,PurePosixPath
archive,out,wanted=sys.argv[1:];wanted=json.loads(wanted);out=Path(out)
assert not out.exists(),'Fresh extraction only'
with zipfile.ZipFile(archive) as z:
 entries=z.infolist();assert 0<len(entries)<=2000
 names=[i.filename for i in entries];assert len(set(names))==len(names)
 assert len({n.casefold() for n in names})==len(names),'Case-fold collision'
 assert sum(i.file_size for i in entries)<=8*1024**3
 for i in entries:
  n=i.filename;parts=n.rstrip('/').split('/')
  assert n and not n.startswith('/') and chr(92) not in n and ':' not in n and chr(0) not in n and all(p not in ('','.','..') for p in parts),'Unsafe ZIP path'
  assert not(i.flag_bits&1) and i.compress_type in (0,8) and i.file_size<=2*1024**3
  kind=stat.S_IFMT(i.external_attr>>16);assert kind in (0,stat.S_IFREG,stat.S_IFDIR),'Nonregular/symlink artifact'
 assert z.testzip() is None,'Artifact CRC failure'
 selected={}
 for name in wanted:
  matches=[i for i in entries if not i.is_dir() and PurePosixPath(i.filename).name==name]
  assert len(matches)==1,('Missing/duplicate exact package',name)
  selected[name]=matches[0]
 out.mkdir(mode=0o700)
 for name,i in selected.items():
  p=out/name
  with z.open(i) as src,p.open('xb') as dst:shutil.copyfileobj(src,dst,1024*1024)
  assert p.stat().st_size==i.file_size and p.is_file() and not p.is_symlink()
 print(json.dumps({'zipCrcVerified':True,'freshExpectedFilesOnly':True,'selected':list(selected),'archiveMembers':len(entries)}))
`;
const ZIP_META=String.raw`import sys,zipfile,stat,re,plistlib,json,struct,posixpath
file,kind=sys.argv[1:]
with zipfile.ZipFile(file) as z:
 entries=z.infolist();names=[i.filename for i in entries];assert 0<len(entries)<=60000 and len(set(names))==len(names)
 assert sum(i.file_size for i in entries)<=8*1024**3
 for i in entries:
  n=i.filename;assert n and not n.startswith('/') and chr(92) not in n and ':' not in n and chr(0) not in n and all(p not in ('','.','..') for p in n.rstrip('/').split('/'))
  assert not(i.flag_bits&1)
  mode=stat.S_IFMT(i.external_attr>>16)
  assert mode in ((0,stat.S_IFREG,stat.S_IFDIR,stat.S_IFLNK) if kind=='mac' else (0,stat.S_IFREG,stat.S_IFDIR))
 assert z.testzip() is None,'Package ZIP CRC failure'
 if kind=='apk':
  assert 'AndroidManifest.xml' in names and 'classes.dex' in names and 'assets/agent/seed.json' in names
  assert not any(n.endswith('agent-rootfs.zip') for n in names)
  assert z.getinfo('assets/agent/seed.json').file_size<65536
  out={'zipCrcVerified':True,'agentRuntimeNotEmbedded':True,'seed':json.loads(z.read('assets/agent/seed.json'))}
 else:
  mains=[n for n in names if re.fullmatch(r'[^/]+[.]app/Contents/Info[.]plist',n)];assert len(mains)==1
  app=mains[0].split('/Contents/')[0]+'/'
  for i in entries:
   if stat.S_ISLNK(i.external_attr>>16):
    assert i.file_size<16384
    target=z.read(i).decode('utf-8');assert target and not target.startswith('/') and chr(92) not in target and ':' not in target and chr(0) not in target
    assert posixpath.normpath(posixpath.join(posixpath.dirname(i.filename),target)).startswith(app),'Symlink escaped app'
  assert z.getinfo(mains[0]).file_size<=1024**2
  info=plistlib.loads(z.read(mains[0]));exe=info.get('CFBundleExecutable');assert isinstance(exe,str) and exe and '/'not in exe and chr(92)not in exe and exe not in('.','..')
  main=app+'Contents/MacOS/'+exe;assert main in names and not stat.S_ISLNK(z.getinfo(main).external_attr>>16)
  with z.open(main) as f:b=f.read(4096)
  magic=b[:4];assert magic in (bytes.fromhex('cafebabe'),bytes.fromhex('bebafeca'),bytes.fromhex('cafebabf'),bytes.fromhex('bfbafeca')),'Universal MachO required'
  endian='>' if magic in (bytes.fromhex('cafebabe'),bytes.fromhex('cafebabf')) else '<';n=struct.unpack_from(endian+'I',b,4)[0];assert 1<n<=8
  wide=magic in(bytes.fromhex('cafebabf'),bytes.fromhex('bfbafeca'));width=32 if wide else 20;cpus=[]
  for j in range(n):
   row=struct.unpack_from(endian+('IIQQII' if wide else 'IIIII'),b,8+j*width);cpu,offset,size=row[0],row[2],row[3];assert size>0 and offset+size<=z.getinfo(main).file_size;cpus.append(cpu)
  assert set(cpus)=={0x01000007,0x0100000c}
  out={'zipCrcVerified':True,'version':info.get('CFBundleShortVersionString'),'bundleVersion':info.get('CFBundleVersion'),'bundleIdentifier':info.get('CFBundleIdentifier'),'universalMachOCpus':cpus,'codeSigningOrNotarizationAssessed':False}
 print(json.dumps(out))
`;
async function downloadArtifact(spec){
 const a=await api(`actions/artifacts/${spec.id}`);assert.equal(a.id,spec.id);assert.equal(a.name,spec.name);assert.equal(a.expired,false);assert.equal(a.size_in_bytes,spec.bytes);assert.equal(a.digest,'sha256:'+spec.sha256);assert.equal(a.workflow_run.id,spec.run);assert.equal(a.workflow_run.head_sha,PACKAGE_SHA);
 const r=await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${spec.id}/zip`,{redirect:'manual',headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(60000)});
 assert.equal(r.status,302);const location=new URL(r.headers.get('location'));assert.equal(location.protocol,'https:');assert(location.hostname.endsWith('.blob.core.windows.net'));assert(!location.username&&!location.password);
 const response=await fetch(location,{redirect:'error',signal:AbortSignal.timeout(1200000)});assert(response.ok&&response.body);
 const file=path.join(root,'archives',spec.id+'.zip'),h=crypto.createHash('sha256');let bytes=0;
 await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_enc,cb){bytes+=chunk.length;if(bytes>spec.bytes)return cb(Error('Artifact exceeds pinned length'));h.update(chunk);cb(null,chunk);}}),fs.createWriteStream(file,{flags:'wx',mode:0o600}));
 assert.equal(bytes,spec.bytes);assert.equal(h.digest('hex'),spec.sha256);
 const extracted=path.join(root,'extracted',String(spec.id));const extraction=json('python3',['-c',EXTRACT,file,extracted,JSON.stringify(spec.wanted)]);
 return {id:spec.id,run:spec.run,name:spec.name,bytes,sha256:spec.sha256,sourceSha:PACKAGE_SHA,extraction,extracted};
}
function latest(text){
 assert(!/[\t\x00]/.test(text));const out={files:[]};let inFiles=false,current;const seen=new Set();
 const scalar=s=>{s=s.trim();if(s.startsWith('"'))return JSON.parse(s);if(s.startsWith("'")){assert(s.endsWith("'"));return s.slice(1,-1).replaceAll("''","'");}assert(s&&!/[&*!|>{}\[\]#`]/.test(s));return s;};
 for(const raw of text.split(/\r?\n/)){if(!raw.trim())continue;let m;
  if((m=/^([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(raw))){const [,key,val='']=m;assert(['version','files','path','sha512','releaseDate'].includes(key)&&!seen.has(key));seen.add(key);inFiles=key==='files';if(inFiles){assert(!val);continue;}out[key]=scalar(val);continue;}
  if((m=/^  - url:\s+(.+)$/.exec(raw))){assert(inFiles);current={url:scalar(m[1])};out.files.push(current);continue;}
  if((m=/^    (sha512|size|blockMapSize):\s+(.+)$/.exec(raw))){assert(inFiles&&current&&!Object.hasOwn(current,m[1]));current[m[1]]=m[1]==='sha512'?scalar(m[2]):Number(m[2]);assert(m[1]==='sha512'||Number.isSafeInteger(current[m[1]])&&current[m[1]]>0);continue;}
  throw Error('Unsupported updater metadata syntax; do not rewrite it');
 }
 assert.equal(out.version,VERSION);assert.equal(out.path,N.setup);assert.equal(out.files.length,1);assert.equal(out.files[0].url,N.setup);assert.equal(typeof out.releaseDate,'string');assert(Number.isFinite(Date.parse(out.releaseDate)));return out;
}
async function sourceBinding(releaseSha){
 assert.match(releaseSha,/^[a-f0-9]{40}$/);assert.equal(git('rev-parse','HEAD'),releaseSha);assert.equal(process.env.GITHUB_SHA,releaseSha);git('merge-base','--is-ancestor',PACKAGE_SHA,releaseSha);
 assert.equal((await api('git/ref/heads/main')).object.sha,releaseSha);
 const diff=git('diff','--name-status','--no-renames',PACKAGE_SHA,releaseSha).split('\n').filter(Boolean).map(x=>x.split('\t'));
 assert.deepEqual(diff.slice().sort((a,b)=>a[1].localeCompare(b[1])),[['A',SELF],['A',WORKFLOW],...DOCS.map(file=>['M',file])].sort((a,b)=>a[1].localeCompare(b[1])),'Release diff must be exactly two publisher additions and six approved documentation edits');
 for(const [status,file]of diff){assert(status==='A'&&[SELF,WORKFLOW].includes(file)||status==='M'&&DOCS.includes(file),'Application/nonapproved source changed: '+file);assert.match(git('ls-tree',releaseSha,'--',file),/^100644 blob /);}
 assert.equal(JSON.parse(git('show',PACKAGE_SHA+':package.json')).version,VERSION);assert.match(git('show',PACKAGE_SHA+':mobile/pubspec.yaml'),/^version:\s*2\.6\.8\+188\s*$/m);
 const notes=fs.readFileSync('docs/RELEASE_NOTES.md','utf8');for(const word of ['维护者','Windows','iOS','未签名'])assert(notes.includes(word),'Missing honest release note: '+word);assert(/未完成|未通过/.test(notes));return {packageSourceSha:PACKAGE_SHA,releaseCommitSha:releaseSha,allowedPublicationAndDocumentationDiff:diff};
}
async function releaseAssets(id,expected){const rows=await all(`releases/${id}/assets`);assertReleaseArtifactScope(rows.map(x=>x.name),{version:VERSION,withVerification:true});for(const e of expected){const r=rows.filter(a=>a.name===e.name);assert.equal(r.length,1);assert.equal(r[0].state,'uploaded');assert.equal(r[0].size,e.size);assert.equal(r[0].digest,'sha256:'+e.sha256);assert.equal(r[0].browser_download_url,publicUrl(e.name));}return rows;}
async function main(){
 assert.equal(process.platform,'linux');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(process.env.GITHUB_REPOSITORY,REPO);assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert(process.env.GH_TOKEN);assert.equal(process.env.MAINTAINER_WAIVER_ACK,ACK);
 const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));assert.equal(event.inputs.maintainer_waiver_ack,ACK);const releaseSha=process.env.RELEASE_COMMIT_SHA;assert.equal(event.inputs.release_commit_sha,releaseSha);
 const base=fs.realpathSync(process.env.RUNNER_TEMP);root=path.join(base,`maintainer-waiver-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);fs.mkdirSync(root);for(const x of ['archives','extracted','assets','evidence'])fs.mkdirSync(path.join(root,x));evidence=path.join(root,'evidence');
 const source=await sourceBinding(releaseSha);write(path.join(evidence,'source-binding.json'),source);
 assert.equal(await api(`releases/tags/${TAG}`,{allow404:true}),null,'Release already exists; never overwrite');assert.equal(await peelTag(false),null,'Tag already exists; never retarget');
 const runs=[];for(const [id,wf]of [[40692112503,296765887],[40692117395,296938219]]){const r=await api(`actions/runs/${id}`);assert.equal(r.status,'completed');assert.equal(r.conclusion,'success');assert.equal(r.head_sha,PACKAGE_SHA);assert.equal(r.workflow_id,wf);runs.push({id,headSha:r.head_sha,status:r.status,conclusion:r.conclusion,url:r.html_url});}
 const artifacts=[];for(const spec of INPUTS)artifacts.push(await downloadArtifact(spec));write(path.join(evidence,'artifact-provenance.json'),{source,runs,artifacts});
 const assetsDir=path.join(root,'assets');for(const name of Object.values(N)){const candidates=artifacts.map(a=>path.join(a.extracted,name)).filter(fs.existsSync);assert.equal(candidates.length,1,'Missing/duplicate original public asset '+name);fs.copyFileSync(candidates[0],path.join(assetsDir,name),fs.constants.COPYFILE_EXCL);}
 assertReleaseArtifactScope(fs.readdirSync(assetsDir),{version:VERSION});const f=name=>path.join(assetsDir,name);
 const yaml=latest(fs.readFileSync(f(N.yaml),'utf8')),installerSha512=await hashFile(f(N.setup),'sha512','base64');assert.equal(yaml.sha512,installerSha512);assert.equal(yaml.files[0].sha512,installerSha512);assert.equal(yaml.files[0].size,fs.statSync(f(N.setup)).size);
 for(const name of [N.setup,N.portable]){const fd=fs.openSync(f(name),'r');try{const b=Buffer.alloc(64);assert.equal(fs.readSync(fd,b,0,64,0),64);assert.equal(b.subarray(0,2).toString(),'MZ');const off=b.readUInt32LE(60),pe=Buffer.alloc(4);assert(off>=64&&off<fs.statSync(f(name)).size-4);fs.readSync(fd,pe,0,4,off);assert.equal(pe.toString('hex'),'50450000');}finally{fs.closeSync(fd);}}
 const dmg=fs.openSync(f(N.dmg),'r');try{const b=Buffer.alloc(512);fs.readSync(dmg,b,0,512,fs.statSync(f(N.dmg)).size-512);assert.equal(b.subarray(0,4).toString(),'koly');assert.equal(b.readUInt32BE(8),512);}finally{fs.closeSync(dmg);}
 const linux=fs.openSync(f(N.linux),'r');try{const b=Buffer.alloc(64);fs.readSync(linux,b,0,64,0);assert.equal(b.subarray(0,4).toString('hex'),'7f454c46');assert.equal(b[4],2);assert.equal(b.readUInt16LE(18),62);assert.equal(b.subarray(8,11).toString('hex'),'414902');}finally{fs.closeSync(linux);}
 const mac=json('python3',['-c',ZIP_META,f(N.mac),'mac']);assert.equal(mac.version,VERSION);assert.equal(mac.bundleIdentifier,'com.langbai.novelai-studio');
 const iosArtifact=artifacts.find(a=>a.name==='novelai-mobile-ios-ipa-unsigned');const iosReceipt=JSON.parse(fs.readFileSync(path.join(iosArtifact.extracted,'ios-package-verification.json'),'utf8'));const ios=json('python3',['-c',unsignedIosIpaInspectionPython,f(N.ipa)]);assertUnsignedIosPackage(iosReceipt,{version:VERSION,buildNumber:BUILD,sourceSha:PACKAGE_SHA,bytes:fs.statSync(f(N.ipa)).size,sha256:ios.sha256,inspection:ios});
 const apk=json('python3',['-c',ZIP_META,f(N.apk),'apk']);const sdk=process.env.ANDROID_HOME??process.env.ANDROID_SDK_ROOT;assert(sdk,'Existing Android SDK required for metadata only');const tool=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(n=>path.join(sdk,'build-tools',n)).find(p=>fs.existsSync(path.join(p,'aapt'))&&fs.existsSync(path.join(p,'apksigner')));assert(tool,'Existing aapt/apksigner unavailable');
 const badging=call(path.join(tool,'aapt'),['dump','badging',f(N.apk)]),pkg=/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m.exec(badging);assert(pkg);assert.equal(pkg[1],'com.codex.novelai.novelai_mobile');assert.equal(pkg[2],BUILD);assert.equal(pkg[3],VERSION);
 const signing=call(path.join(tool,'apksigner'),['verify','--print-certs',f(N.apk)]);const certificate=signing.match(/Signer #1 certificate SHA-256 digest:\s*([a-f0-9]{64})/i)?.[1]?.toLowerCase();assert(certificate,'APK signing integrity unavailable');
 const seed=apk.seed;assert.match(seed.version,/^[A-Za-z0-9_.-]+$/);assert.match(seed.sha256,/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(seed.bytes)&&seed.bytes>0);assert.equal(seed.url,`https://github.com/${REPO}/releases/download/agent-v${seed.version}/agent-rootfs.zip`);
 const component=await api(`releases/tags/agent-v${seed.version}`);assert.equal(component.draft,false);const componentAssets=await all(`releases/${component.id}/assets`);assert(componentAssets.some(a=>a.name==='agent-rootfs.zip'&&a.size===seed.bytes));assert(componentAssets.some(a=>a.name==='android-agent.json'));
 const descriptorResponse=await fetch(seed.url.replace(/agent-rootfs.zip$/,'android-agent.json'),{signal:AbortSignal.timeout(60000)});assert(descriptorResponse.ok);const descriptorText=await descriptorResponse.text();assert(Buffer.byteLength(descriptorText)<65536);const descriptor=JSON.parse(descriptorText);for(const key of ['sha256','bytes','upstream'])assert.equal(descriptor[key],seed[key]);
 const runtimeHead=await fetch(seed.url,{method:'HEAD',signal:AbortSignal.timeout(60000)});assert(runtimeHead.ok);assert.equal(Number(runtimeHead.headers.get('content-length')),seed.bytes);
 const inspections={windows:{versionScope:'CI source + original filename + original latest.yml; no install/resource/runtime verification',peHeadersPresent:true,updater:{version:yaml.version,path:yaml.path,files:yaml.files,installerSha512}},mac,ios,android:{package:pkg[1],versionCode:pkg[2],versionName:pkg[3],apkCertificateSha256:certificate,apkCryptographicSignatureVerified:true,previousReleaseSigningContinuityChecked:false,zipCrcVerified:apk.zipCrcVerified,agentReference:{url:seed.url,descriptorMatchesSeed:true,publicHeadStatus:runtimeHead.status,runtimeStarted:false}},linux:{format:'ELF64 x86_64 AppImage type2',versionScope:'original filename + CI source',runtimeExecuted:false},dmg:{udifFooterPresent:true,versionScope:'original filename + same CI artifact source; contents not mounted'}};write(path.join(evidence,'package-metadata.json'),inspections);
 const files=Object.values(N).map(name=>({name,file:f(name),size:fs.statSync(f(name)).size}));for(const a of files)a.sha256=await hashFile(a.file);
 const receipt={schema:'maintainer-waiver-publication/v1',version:VERSION,packageSourceSha:PACKAGE_SHA,releaseCommitSha:releaseSha,publicationAuthorizedUnderMaintainerWaiver:true,fullFunctionalAcceptancePassed:false,nativeFeatureGateSatisfied:false,noNewFunctionalOrModelAcceptanceExecuted:true,maintainerAuthorization:{authorizationSha256:AUTH_SHA,actor:process.env.GITHUB_ACTOR,workflowRunId:process.env.GITHUB_RUN_ID,confirmation:ACK,summary:'User explicitly requested formal v2.6.8 Latest publication without further local acceptance, disclosing unfinished/failed checks.'},knownUncompletedOrFailedChecks:[{scope:'Windows Artist GPU',status:'not-completed',scenarios:['model-runtime-lifecycle','search-score-selected-generation','install-resume-error'],controlledDiagnosticsAreNotFormalPass:true},{scope:'iOS output folder native diagnostic',status:'not-passed',runId:40689684498,sourceSha:PACKAGE_SHA,productDefectNotEstablished:true,observedError:'No unique usable literal Folder84pt icon in the held carrier'},{scope:'candidate builds',status:'functional/source/metadata/native-runtime/install/upgrade/Agent startup and macOS Intel runtime gates intentionally skipped; package-only checks here do not replace them'}],iosDistribution:'Unsigned IPA; requires user signing/sideloading, not App Store/TestFlight or directly installable on an ordinary iPhone',linuxScope:'Ubuntu24.04 x86_64 build baseline only; Ubuntu26.04 runtime hang observed/unsupported, other distributions not certified',source,runs,artifacts:artifacts.map(({extracted,...a})=>a),packageMetadata:inspections,updaterUrl:publicUrl(N.setup),assets:files.map(({file,...a})=>a),receiptSelfHashOmittedToAvoidRecursion:true,formalVerifiedPublisherUnmodified:true};
 write(f('verification.json'),receipt);files.push({name:'verification.json',file:f('verification.json'),size:fs.statSync(f('verification.json')).size,sha256:await hashFile(f('verification.json'))});assertReleaseArtifactScope(files.map(x=>x.name),{version:VERSION,withVerification:true});write(path.join(evidence,'pre-publication-checks.json'),{source,files:files.map(({file,...a})=>a),fullFunctionalAcceptancePassed:false});
 // Re-read mutable refs immediately before the first write. Never overwrite a tag/release.
 await sourceBinding(releaseSha);assert.equal(await api(`releases/tags/${TAG}`,{allow404:true}),null);assert.equal(await peelTag(false),null);
 call('gh',['release','create',TAG,'--repo',REPO,'--target',releaseSha,'--draft','--title',`Langbai NovelAI Studio ${TAG}`,'--notes-file','docs/RELEASE_NOTES.md']);
 const draft=await api(`releases/tags/${TAG}`);assert(draft.draft&&!draft.prerelease&&draft.target_commitish===releaseSha);ownedDraftId=draft.id;write(path.join(evidence,'owned-draft.json'),{id:ownedDraftId,tag:TAG,target:releaseSha,createdByThisRun:true});const draftTag=await peelTag(false);if(draftTag!==null)assert.equal(draftTag,releaseSha);
 call('gh',['release','upload',TAG,'--repo',REPO,...files.map(x=>x.file)]);const uploaded=await releaseAssets(ownedDraftId,files);write(path.join(evidence,'draft-upload-readback.json'),{id:ownedDraftId,assets:uploaded});
 assert.equal((await api('git/ref/heads/main')).object.sha,releaseSha);const tagBefore=await peelTag(false);if(tagBefore!==null)assert.equal(tagBefore,releaseSha);const stillDraft=await api(`releases/${ownedDraftId}`);assert(stillDraft.draft&&!stillDraft.prerelease&&stillDraft.target_commitish===releaseSha);
 call('gh',['release','edit',TAG,'--repo',REPO,'--draft=false','--latest']);
 const published=await api(`releases/${ownedDraftId}`),latestRelease=await api('releases/latest');assert(!published.draft&&!published.prerelease&&published.tag_name===TAG&&published.target_commitish===releaseSha);assert.equal(latestRelease.id,ownedDraftId);assert.equal(latestRelease.tag_name,TAG);assert.equal(await peelTag(true),releaseSha);assert.equal((await api('git/ref/heads/main')).object.sha,releaseSha);const finalAssets=await releaseAssets(ownedDraftId,files);
 write(path.join(evidence,'published-readback.json'),{published:true,releaseId:ownedDraftId,url:published.html_url,tag:TAG,isLatest:true,packageSourceSha:PACKAGE_SHA,releaseCommitSha:releaseSha,assets:finalAssets,fullFunctionalAcceptancePassed:false,maintainerWaiver:true});console.log('MAINTAINER_WAIVER_RELEASE_PUBLISHED '+published.html_url);
}
main().catch(error=>{const token=process.env.GH_TOKEN??'';const message=String(error.stack??error).replaceAll(token||'__NO_TOKEN__','[REDACTED]');if(evidence)fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({failure:message,ownedDraftId,automaticCleanupOrOverwritePerformed:false,fullFunctionalAcceptancePassed:false})+'\n');console.error(message);process.exitCode=1;});
