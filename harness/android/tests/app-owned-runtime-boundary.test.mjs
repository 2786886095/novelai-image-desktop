import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'rolldown';

const project=fileURLToPath(new URL('../../../',import.meta.url));
const resolver=path.join(project,'harness/android/resolve-published-runtime.mjs');
const approved=[
  'harness/plugins/studio-library/lib/client.js',
  'harness/plugins/studio-library/template-panel.js',
  'harness/plugins/studio-library/template-selection.js',
  'harness/plugins/studio-library/template-selection.test.mjs',
  'harness/plugins/studio-tools/index.js',
];
const lock={format:1,protocol:1,version:'0.1.8',upstream:'0.1.7-rc.2',platform:'android',arch:'arm64',minSdk:26};
const runtimePaths=[
  'harness/plugins/studio-library/index.js',
  'harness/plugins/studio-library/protocol.js',
  'harness/plugins/studio-library/package.json',
  'harness/plugins/studio-library/not-a-managed-input.js',
  'harness/plugins/studio-tools/package.json',
  'harness/android/runtime-lock.json',
  'harness/android/seed-home.mjs',
  'harness/android/build-rootfs.sh',
  'harness/android/runtime/package-lock.json',
  'harness/build-library.mjs',
];

async function write(root,name,value){
  const target=path.join(root,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,value);
}
function git(root,...args){
  const result=spawnSync('git',['-c','core.hooksPath=','-c','commit.gpgsign=false',...args],{cwd:root,encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(result.status,0,`${args.join(' ')}\n${result.stdout}\n${result.stderr}`);return result.stdout;
}
async function fixture(fn){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-overlay-source-'));
  try {
    git(root,'init','--quiet');git(root,'config','user.name','Synthetic runtime policy fixture');git(root,'config','user.email','runtime-fixture@example.invalid');git(root,'config','core.autocrlf','false');
    for(const name of [...approved,...runtimePaths])await write(root,name,name.endsWith('runtime-lock.json')?JSON.stringify(lock)+'\n':'pristine immutable seed\n');
    git(root,'add','--','harness');git(root,'commit','--quiet','-m','Synthetic immutable component');git(root,'tag','agent-v0.1.8');
    // This is a tiny synthetic transport fixture, not a downloaded/published runtime
    // and not device acceptance. Source checks and the real resolver CLI still run.
    const bytes=Buffer.from('synthetic resolver policy archive');
    const meta={...lock,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:'https://github.com/2786886095/novelai-image-desktop/releases/download/agent-v0.1.8/agent-rootfs.zip'};
    await write(root,'transport-fixture.mjs',`const bytes=Buffer.from(${JSON.stringify(bytes.toString('base64'))},'base64');const meta=${JSON.stringify(meta)};globalThis.fetch=async url=>{if(url===meta.url.replace('agent-rootfs.zip','android-agent.json'))return Response.json(meta);if(url===meta.url)return new Response(bytes);throw Error('Unexpected fixture URL');};\n`);
    await fn(root,bytes);
  } finally {assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
}
function runResolver(root){
  return spawnSync(process.execPath,['--import',pathToFileURL(path.join(root,'transport-fixture.mjs')).href,resolver],{
    cwd:root,encoding:'utf8',timeout:45000,windowsHide:true,
    env:{...process.env,GITHUB_OUTPUT:path.join(root,'github-output.txt'),GIT_TERMINAL_PROMPT:'0'},
  });
}
async function commitChanges(root,paths){
  for(const name of paths)await fs.appendFile(path.join(root,name),'\nchanged in app commit\n');
  git(root,'add','--','harness');git(root,'commit','--quiet','-m','Synthetic current app source');
}

test('real resolver CLI accepts only the five exact app-owned template inputs',async t=>{
  for(const changes of [...approved.map(name=>[name]),approved])await t.test(changes.join(', '),()=>fixture(async(root,bytes)=>{
    await commitChanges(root,changes);const result=runResolver(root);
    assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PUBLISHED_RUNTIME_REUSED/);
    assert.deepEqual(await fs.readFile(path.join(root,'artifacts/android-runtime/agent-rootfs.zip')),bytes);
    assert.equal(await fs.readFile(path.join(root,'github-output.txt'),'utf8'),'reused=true\n');
    const seed=JSON.parse(await fs.readFile(path.join(root,'artifacts/android-runtime/seed.json'),'utf8'));
    assert.equal(seed.version,'0.1.8');assert.equal(seed.sha256,createHash('sha256').update(bytes).digest('hex'));
  }));
});

test('real resolver CLI still rejects protocol, host, package, builder, lock and other runtime changes',async t=>{
  for(const name of runtimePaths)await t.test(name,()=>fixture(async root=>{
    // Keep lock JSON valid; the failure must be the immutable Git check, not JSON parsing.
    if(name.endsWith('runtime-lock.json')){
      await fs.appendFile(path.join(root,name),'\n');git(root,'add','--','harness');git(root,'commit','--quiet','-m','Cosmetic lock source change');
    }else await commitChanges(root,[name]);
    const result=runResolver(root);
    assert.notEqual(result.status,0,result.stdout);assert.match(result.stderr,/Command failed: git diff --exit-code/);
    assert.doesNotMatch(result.stdout,/PUBLISHED_RUNTIME_REUSED|NEW_COMPONENT_BUILD_REQUIRED/);
    await assert.rejects(fs.stat(path.join(root,'artifacts/android-runtime/agent-rootfs.zip')),/ENOENT/);
    await assert.rejects(fs.stat(path.join(root,'github-output.txt')),/ENOENT/);
  }));
});

function stageIncludes(gradle,plugin){
  const marker=`from(rootProject.file('../../harness/plugins/${plugin}')) {`;
  const start=gradle.indexOf(marker);assert.notEqual(start,-1,`Missing Gradle source: ${plugin}`);
  const block=gradle.slice(start+marker.length,gradle.indexOf('\n    }',start));
  const include=block.match(/include ([^\n]+)/);assert.ok(include,`Missing includes: ${plugin}`);
  return [...include[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
}
async function importClosure(file,seen=new Set()){
  if(seen.has(file))return seen;seen.add(file);
  const source=await fs.readFile(file,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\/?[^'"]+)['"]/g))await importClosure(path.resolve(path.dirname(file),match[1]),seen);
  return seen;
}

test('actual source import closure rebuilds the exact packaged client and Gradle stages its bytes',async()=>{
  const root=path.join(project,'harness/plugins/studio-library');
  const closure=await importClosure(path.join(root,'client.js'));
  for(const name of ['template-panel.js','template-selection.js'])assert.ok(closure.has(path.join(root,name)),`Client no longer includes approved source ${name}`);
  assert.ok(!closure.has(path.join(root,'template-selection.test.mjs')),'Test is not runtime client input');
  const result=await build({input:path.join(root,'client.js'),external:id=>id==='react'||id.startsWith('@deepseek-ai/'),output:{format:'cjs'}});
  const expected=Buffer.from(`window.__ModuleLoader__.load({id:"@langbai/dsh-studio-library",factory(require){const module={exports:{}};const exports=module.exports;\n${result.output[0].code}\nreturn module.exports;}});\n`);
  assert.deepEqual(await fs.readFile(path.join(root,'lib/client.js')),expected,'Compiled app client must match current source, not a stale rootfs client');
  const gradle=await fs.readFile(path.join(project,'mobile/android/app/build.gradle'),'utf8');
  const library=stageIncludes(gradle,'studio-library'),tools=stageIncludes(gradle,'studio-tools');
  assert.deepEqual(new Set(library),new Set(['package.json','index.js','protocol.js','jev-config.js','panel-layout-store.js','lib/client.js']));
  assert.deepEqual(new Set(tools),new Set(['package.json','index.js']));
  // Materialise precisely the declared Gradle inputs in disposable filesystem space.
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'studio-overlay-stage-'));
  try {
    for(const [plugin,names] of [['studio-library',library],['studio-tools',tools]])for(const name of names){
      const source=await fs.readFile(path.join(project,'harness/plugins',plugin,name));await write(stage,`${plugin}/${name}`,source);
      assert.deepEqual(await fs.readFile(path.join(stage,plugin,name)),source);
    }
    assert.deepEqual(await fs.readFile(path.join(stage,'studio-library/lib/client.js')),expected);
    assert.deepEqual(await fs.readFile(path.join(stage,'studio-tools/index.js')),await fs.readFile(path.join(project,approved[4])));
    await assert.rejects(fs.stat(path.join(stage,'studio-library/template-selection.test.mjs')),/ENOENT/);
  }finally{assert.equal(path.dirname(stage),os.tmpdir());await fs.rm(stage,{recursive:true,force:true});}
});

test('Android production startup applies the managed patch after seed patches without changing protocol or lock',async()=>{
  const native=await fs.readFile(path.join(project,'mobile/android/app/src/main/kotlin/com/codex/novelai/novelai_mobile/agent/LocalAgentRuntime.kt'),'utf8');
  const args=native.match(/private fun webArgs\(\): List<String> = listOf\(([^\n]+)\)/)?.[1];assert.ok(args);
  assert.ok(args.lastIndexOf('/studio-presentation/presentation.patch.yml')>args.lastIndexOf('/studio-home/studio-data.patch.yml'));
  assert.ok(args.lastIndexOf('/studio-presentation/presentation.patch.yml')>args.lastIndexOf('/studio-home/studio.patch.yml'));
  const liveLock=JSON.parse(await fs.readFile(path.join(project,'harness/android/runtime-lock.json'),'utf8'));
  assert.equal(liveLock.version,'0.1.8');assert.equal(liveLock.protocol,1);assert.equal(liveLock.upstream,'0.1.7-rc.2');
});

// QA launchers/docs are not copied into the immutable runtime. These exact two
// exceptions must not become a blanket exemption for test-runner siblings.
const exactQaOnlyPaths=[
  'harness/android/test-runner/README.md',
  'harness/android/test-runner/arm64-emulator.mjs',
];
test('real resolver CLI permits only the two exact non-packaged Android QA inputs',async t=>{
  for(const changes of [...exactQaOnlyPaths.map(name=>[name]),exactQaOnlyPaths])await t.test(changes.join(', '),()=>fixture(async(root,bytes)=>{
    for(const name of changes)await write(root,name,await fs.readFile(path.join(project,name)));
    git(root,'add','--','harness');git(root,'commit','--quiet','-m','Exact non-runtime QA files');
    const result=runResolver(root);
    assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PUBLISHED_RUNTIME_REUSED/);
    assert.deepEqual(await fs.readFile(path.join(root,'artifacts/android-runtime/agent-rootfs.zip')),bytes);
    assert.equal(await fs.readFile(path.join(root,'github-output.txt'),'utf8'),'reused=true\n');
  }));
});
test('real resolver CLI still rejects unknown test-runner siblings',()=>fixture(async root=>{
  await write(root,'harness/android/test-runner/unknown-runtime-input.mjs','Not an approved exception\n');
  git(root,'add','--','harness');git(root,'commit','--quiet','-m','Unknown QA-directory input');
  const result=runResolver(root);
  assert.notEqual(result.status,0,result.stdout);assert.match(result.stderr,/Command failed: git diff --exit-code/);
  assert.doesNotMatch(result.stdout,/PUBLISHED_RUNTIME_REUSED|NEW_COMPONENT_BUILD_REQUIRED/);
  await assert.rejects(fs.stat(path.join(root,'artifacts/android-runtime/agent-rootfs.zip')),/ENOENT/);
  await assert.rejects(fs.stat(path.join(root,'github-output.txt')),/ENOENT/);
}));
