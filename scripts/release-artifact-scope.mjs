// Current release-only artifact/job policy. Pure checks; never invokes GitHub or publishes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export const supplementalArtifactPolicyId='unsigned-ios-ipa-supplement/v1';
export const supplementalArtifactPolicy=Object.freeze({id:supplementalArtifactPolicyId,assets:Object.freeze([Object.freeze({name:'novelai-mobile-unsigned.ipa',platform:'ios',packageKind:'unsigned-ipa',functionalCertificationGranted:false,installationLabel:'未签名／需自行签名'})])});
export const supplementalArtifactPolicySha256=crypto.createHash('sha256').update(JSON.stringify(supplementalArtifactPolicy)).digest('hex');
export function releaseArtifactNames(version,{withVerification=false}={}) {
  assert.ok(/^\d+\.\d+\.\d+$/.test(version),'Invalid release asset version');
  const names=[`Langbai-NovelAI-Studio-Setup-${version}.exe`,`Langbai-NovelAI-Studio-${version}.exe`,`Langbai-NovelAI-Studio-${version}-universal.dmg`,`Langbai-NovelAI-Studio-${version}.zip`,`Langbai-NovelAI-Studio-${version}.AppImage`,'latest.yml','app-release.apk','novelai-mobile-unsigned.ipa'];
  return withVerification?[...names,'verification.json']:names;
}
export function assertReleaseArtifactScope(names,{version,withVerification=false}={}) {
  assert.ok(Array.isArray(names)&&names.every(name=>typeof name==='string'),'Release asset names are required');
  assert.deepEqual([...names].sort(),releaseArtifactNames(version,{withVerification}).sort(),
    'Current four-platform release plus unsigned IPA supplement assets differ; extra/missing/duplicate assets are not allowed');
}
export function assertFourPlatformMobileRun(run) {
  assert.equal(run?.status,'completed','Mobile workflow is not completed');
  assert.equal(run?.conclusion,'success','Mobile workflow did not succeed');
  assert.ok(Array.isArray(run.jobs),'Mobile workflow jobs are required');
  for(const name of ['android','android-agent-runtime','ios-package']) {
    const matches=run.jobs.filter(job=>job.name===name);
    assert.equal(matches.length,1,'Missing or duplicate required mobile job: '+name);
    assert.equal(matches[0].conclusion,'success','Required mobile job did not succeed: '+name);
  }
  const ios=run.jobs.filter(job=>job.name==='ios');
  assert.ok(ios.length<=1,'Duplicate excluded iOS job');
  if(ios.length)assert.equal(ios[0].conclusion,'skipped','Legacy iOS feature job must remain skipped; only ios-package may produce the unsigned supplement');
}

// Package provenance/structure only. This is not an iOS feature/native acceptance gate.
export function assertUnsignedIosPackage(receipt,{version,buildNumber,sourceSha,bytes,sha256,inspection}={}) {
  assert.match(sourceSha??'',/^[a-f0-9]{40}$/,'Immutable iOS package build source is required');
  assert.match(sha256??'',/^[a-f0-9]{64}$/,'Actual IPA SHA-256 is required');
  assert.ok(Number.isSafeInteger(bytes)&&bytes>0,'Actual IPA byte length is required');
  assert.equal(receipt?.schema,'unsigned-ios-package/v1','Unsigned package receipt schema differs');
  for(const [field,value]of Object.entries({sourceSha,version,buildNumber,bytes,sha256,asset:'novelai-mobile-unsigned.ipa',bundleIdentifier:'com.codex.novelai.novelaiMobile',packageKind:'unsigned-ipa',unsigned:true,functionalCertificationGranted:false}))assert.equal(receipt[field],value,'Unsigned package receipt differs: '+field);
  for(const [field,value]of Object.entries({version,buildNumber,bytes,sha256,bundleIdentifier:'com.codex.novelai.novelaiMobile',packageKind:'unsigned-ipa',unsigned:true,functionalCertificationGranted:false,zipCrcVerified:true,mainExecutablePresent:true,mainMachOCodeSignaturePresent:false}))assert.equal(inspection?.[field],value,'Actual IPA structure differs: '+field);
}
// Python standard library, used only when explicitly invoked by the gated publisher/tests.
export const unsignedIosIpaInspectionPython=String.raw`import sys,os,stat,zipfile,plistlib,json,re,hashlib,struct
file=sys.argv[1];st=os.lstat(file)
assert stat.S_ISREG(st.st_mode) and not stat.S_ISLNK(st.st_mode),'IPA must be a regular file'
assert 0<st.st_size<=2*1024**3,'IPA size exceeds bounded package limit'
with zipfile.ZipFile(file) as z:
 entries=z.infolist();names=[i.filename for i in entries]
 assert 0<len(entries)<=50000 and len(set(names))==len(names),'Invalid or duplicate ZIP entries'
 assert sum(i.file_size for i in entries)<=4*1024**3,'Uncompressed IPA exceeds bounded limit'
 for i in entries:
  n=i.filename
  assert n and not n.startswith('/') and chr(92) not in n and ':' not in n and not any(p in ('.','..') for p in n.split('/')),'Unsafe IPA entry path'
  assert not (i.flag_bits&1) and not stat.S_ISLNK(i.external_attr>>16),'Encrypted/symlink IPA entry'
 mains=[n for n in names if re.fullmatch(r'Payload/[^/]+[.]app/Info[.]plist',n)]
 assert len(mains)==1,'Exactly one main app plist is required'
 app=mains[0][:-len('Info.plist')]
 assert z.getinfo(mains[0]).file_size<=1024**2,'Main app plist exceeds bound'
 info=plistlib.loads(z.read(mains[0]));executable=info.get('CFBundleExecutable')
 assert isinstance(executable,str) and re.fullmatch(r'[A-Za-z0-9_.-]+',executable) and executable not in ('.','..'),'Invalid main executable name'
 assert app+executable in names and not z.getinfo(app+executable).is_dir() and z.getinfo(app+executable).file_size>0,'Main executable missing'
 with z.open(app+executable) as main:
  header=main.read(32)
  assert len(header)==32 and header[:4] in (bytes.fromhex('cffaedfe'),bytes.fromhex('feedfacf')),'Main executable must be a64-bit MachO'
  endian='<' if header[:4]==bytes.fromhex('cffaedfe') else '>'
  magic,cpu,subtype,kind,ncmds,sizeofcmds,flags,reserved=struct.unpack(endian+'8I',header)
  assert cpu==0x0100000c,'Main executable must be ARM64'
  assert ncmds<=65535 and sizeofcmds<=16*1024**2 and sizeofcmds<=z.getinfo(app+executable).file_size-32,'Invalid main load command bounds'
  commands=main.read(sizeofcmds);assert len(commands)==sizeofcmds,'Truncated main load commands'
  cursor=0
  for _ in range(ncmds):
   assert cursor+8<=len(commands),'Truncated load command header'
   command,size=struct.unpack_from(endian+'2I',commands,cursor)
   assert size>=8 and size%4==0 and cursor+size<=len(commands),'Invalid load command size'
   assert command!=0x1d,'Main app has LC_CODE_SIGNATURE'
   cursor+=size
  assert cursor==sizeofcmds,'Load command total differs'
 assert app+'embedded.mobileprovision' not in names,'Signed provisioning profile is not an unsigned supplement'
 assert not any(n.startswith(app+'_CodeSignature/') and not n.endswith('/') for n in names),'Main app signature resources are not allowed'
 assert z.testzip() is None,'IPA ZIP CRC verification failed'
 output={'version':info.get('CFBundleShortVersionString'),'buildNumber':info.get('CFBundleVersion'),'bundleIdentifier':info.get('CFBundleIdentifier'),'appRoot':app,'mainExecutablePresent':True,'mainMachOCodeSignaturePresent':False,'zipCrcVerified':True,'packageKind':'unsigned-ipa','unsigned':True,'functionalCertificationGranted':False}
h=hashlib.sha256()
with open(file,'rb') as stream:
 for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
assert os.stat(file).st_size==st.st_size,'IPA changed during inspection'
output.update(bytes=st.st_size,sha256=h.hexdigest());print(json.dumps(output,sort_keys=True))
`;
