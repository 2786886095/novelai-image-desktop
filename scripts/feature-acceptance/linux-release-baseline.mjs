import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Distribution identity only. A matching host is not a functional pass and must
// never replace the native journeys, final package or Sharp/runtime checks.
export const linuxReleaseBaseline = Object.freeze({id:'ubuntu',versionId:'24.04',arch:'x64',machine:'x86_64'});
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

export function parseOsRelease(raw) {
  if(typeof raw!=='string'||raw.length===0||raw.length>65536||raw.includes('\0'))throw new Error('Invalid literal os-release');
  const values={};
  for(const line of raw.split(/\r?\n/)) {
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const m=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if(!m||Object.hasOwn(values,m[1]))throw new Error('Malformed or duplicate os-release key');
    let value=m[2];
    if(value.startsWith('"')||value.startsWith("'")) {
      const quote=value[0];
      if(value.length<2||value.at(-1)!==quote)throw new Error('Malformed os-release quoting');
      value=value.slice(1,-1);
      if(quote==='"')value=value.replace(/\\(["\\$`])/g,'$1');
    } else if(!/^[A-Za-z0-9._/-]*$/.test(value))throw new Error('Malformed unquoted os-release value');
    values[m[1]]=value;
  }
  return values;
}

export function assertLinuxReleaseBaseline(receipt) {
  if(receipt?.schema!=='linux-release-baseline/v1')throw new Error('Invalid baseline receipt schema');
  if(receipt.functionalCertificationGranted!==false)throw new Error('Host identity cannot certify functionality');
  if(!/^[a-f0-9]{40}$/.test(receipt.sourceSha??''))throw new Error('Immutable source SHA required');
  if(!['desktop-build','desktop-native'].includes(receipt.phase))throw new Error('Unknown desktop phase');
  if(receipt.platform!=='linux'||receipt.arch!==linuxReleaseBaseline.arch)throw new Error('Linux x64 host required');
  const actual=parseOsRelease(receipt.osReleaseRaw);
  if(actual.ID!==linuxReleaseBaseline.id||actual.VERSION_ID!==linuxReleaseBaseline.versionId)throw new Error('Actual Ubuntu 24.04 host required');
  const wanted=[['uname',['-a']],['uname',['-m']],['getconf',['GNU_LIBC_VERSION']],['git',['rev-parse','HEAD']]];
  if(!Array.isArray(receipt.commands)||receipt.commands.length!==wanted.length)throw new Error('Complete raw host commands required');
  for(let i=0;i<wanted.length;i++) {
    const c=receipt.commands[i];
    if(c?.file!==wanted[i][0]||JSON.stringify(c.args)!==JSON.stringify(wanted[i][1])||c.exitStatus!==0||c.signal!==null||c.error!==null||typeof c.stdout!=='string'||!c.stdout.trim()||typeof c.stderr!=='string')throw new Error('Host command failed or differs');
  }
  if(receipt.commands[1].stdout.trim()!==linuxReleaseBaseline.machine)throw new Error('Actual x86_64 machine required');
  if(!/^glibc \d+\.\d+(?:\.\d+)?\s*$/.test(receipt.commands[2].stdout))throw new Error('Actual glibc version required');
  if(receipt.commands[3].stdout.trim()!==receipt.sourceSha)throw new Error('Actual checkout HEAD differs from source SHA');
  return {id:actual.ID,versionId:actual.VERSION_ID,arch:receipt.arch,sourceSha:receipt.sourceSha,functionalCertificationGranted:false};
}

export function collectLinuxReleaseBaseline({sourceSha,phase}) {
  const receipt={schema:'linux-release-baseline/v1',sourceSha,phase,platform:process.platform,arch:process.arch,functionalCertificationGranted:false,
    capturedAt:new Date().toISOString(),osReleaseRaw:null,commands:[],runner:{os:process.env.RUNNER_OS??null,imageOS:process.env.ImageOS??null,imageVersion:process.env.ImageVersion??null,runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null},status:'failed',error:null};
  try {
    // No CLI/env option can substitute distro text, process.platform or arch.
    receipt.osReleaseRaw=fs.readFileSync('/etc/os-release','utf8');
    for(const[file,args]of[['uname',['-a']],['uname',['-m']],['getconf',['GNU_LIBC_VERSION']],['git',['rev-parse','HEAD']]]) {
      const r=spawnSync(file,args,{cwd:sourceRoot,encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
      receipt.commands.push({file,args,stdout:r.stdout??'',stderr:r.stderr??'',exitStatus:r.status,signal:r.signal??null,error:r.error?String(r.error):null});
    }
    assertLinuxReleaseBaseline(receipt);receipt.status='passed';
  }catch(error){receipt.error=String(error);}
  return receipt;
}

export function main(args=process.argv.slice(2)) {
  const options={};
  for(let i=0;i<args.length;i+=2) {
    if(!['--source-sha','--phase','--output'].includes(args[i])||!args[i+1]||Object.hasOwn(options,args[i]))throw new Error('Expected unique --source-sha, --phase and --output');
    options[args[i]]=args[i+1];
  }
  if(Object.keys(options).length!==3||!/^[a-f0-9]{40}$/.test(options['--source-sha'])||!['desktop-build','desktop-native'].includes(options['--phase']))throw new Error('Invalid baseline command arguments');
  const output=path.resolve(options['--output']);
  // A previous run must not be silently relabelled as evidence for this one.
  if(fs.existsSync(output))throw new Error('Baseline output must be fresh');
  const receipt=collectLinuxReleaseBaseline({sourceSha:options['--source-sha'],phase:options['--phase']});
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const bytes=JSON.stringify(receipt,null,2)+'\n';fs.writeFileSync(output,bytes,{encoding:'utf8',flag:'wx'});
  process.stdout.write(bytes);
  if(receipt.status!=='passed')process.exitCode=1;
  return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main();}catch(error){console.error(String(error));process.exitCode=1;}
}
