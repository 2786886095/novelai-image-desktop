// Reproducible local adapter. Never installs into the user's active DSH_HOME.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'rolldown';
import {simplifyMemoryUI} from './community/memory-ui.mjs';
import {adaptStrictCodecs,adaptSettingsScope,adaptIcons} from './community/harness-017.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(repo,'harness/community');
const target=path.join(repo,'.tmp/harness-community');
const lock=JSON.parse(await fs.readFile(path.join(source,'lock.json'),'utf8'));
const manifests=JSON.parse(await fs.readFile(path.join(source,'standalone-manifests.json'),'utf8'));
await fs.mkdir(target,{recursive:true});
const temp=await fs.mkdtemp(path.join(repo,'.tmp/community-build-'));
for(const [name,hash] of Object.entries(lock.archives)) {
  const archive=path.join(source,name);
  if(crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex')!==hash)throw new Error(`Archive checksum mismatch: ${name}`);
  const list=execFileSync('tar',['-tzf',archive],{encoding:'utf8',windowsHide:true,timeout:30000}).split(/\r?\n/).filter(Boolean);
  if(list.some(p=>!p.startsWith('package/')||p.split('/').includes('..')||p.includes('\\')))throw new Error('Invalid archive path');
  const dir=path.join(temp,name);await fs.mkdir(dir);execFileSync('tar',['-xzf',archive,'-C',dir],{windowsHide:true,timeout:30000});
}
const rp=path.join(temp,'lutrodev-dsh-roleplay-0.1.8.tgz/package');
const aliases=Object.keys(manifests).map(p=>[`@lutrodev/dsh-roleplay/${path.basename(p)}`,`dsh-roleplay-${path.basename(p)}`]);
aliases.push(['@lutrodev/dsh-roleplay','dsh-roleplay-rp-feature-manager']);aliases.sort((a,b)=>b[0].length-a[0].length);
async function rewrite(dir) {
  for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())await rewrite(file);
    else if(/\.(js|json|yml)$/.test(entry.name)) {
      let text=await fs.readFile(file,'utf8');for(const [a,b] of aliases)text=text.replaceAll(a,b);
      // Exact adapted service version, not an unrestricted bypass of the compatibility check.
      if(entry.name==='catalog.js')text=text.replace("SUPPORTED_DSH_RANGE = '0.1.2-rc.1'",`SUPPORTED_DSH_RANGE = '${lock.harnessServices}'`);
      await fs.writeFile(file,text);
    }
  }
}
const packages=[];
for(const [relative,original] of Object.entries(manifests)) {
  const name=original.name,dest=path.join(target,'packages',name);packages.push(name);
  await fs.cp(path.join(rp,relative),dest,{recursive:true});
  const meta={...original};for(const key of ['dependencies','devDependencies','peerDependencies','scripts'])delete meta[key];
  await fs.writeFile(path.join(dest,'package.json'),JSON.stringify(meta,null,2));await rewrite(dest);
  if(name==='dsh-roleplay-rp-preset'){
    const builtinDir=path.join(dest,'src/studio-builtins');await fs.mkdir(builtinDir,{recursive:true});
    await fs.copyFile(path.join(source,'install-builtin-preset.mjs'),path.join(builtinDir,'install.mjs'));
    await fs.copyFile(path.join(source,'infinite-gen4/LICENSE'),path.join(builtinDir,'LICENSE'));
    const upstream=await fs.readFile(path.join(source,'infinite-gen4/infinite-gen-4.md'),'utf8');
    const provenance=JSON.parse(await fs.readFile(path.join(source,'infinite-gen4/SOURCE.json'),'utf8'));
    if(crypto.createHash('sha256').update(upstream).digest('hex')!==provenance.promptSha256)throw Error('Builtin prompt checksum mismatch');
    const preset={name:'无限四代 · Studio',description:'dsh-infinite-gen-4 '+provenance.version+'，按会话选择的预设适配；不全局注入。',fields:[{name:'上游预设',description:provenance.repo+' @ '+provenance.commit,position:'top',content:upstream},{name:'Studio 实际工具执行',position:'bottom',content:'本会话运行于真实 NovelAI Studio。涉及软件读取、保存或生图时，必须实际调用工具，并只报告工具确认的结果，不用占位符伪造执行。普通聊天继续沿用选中的角色卡、世界书和记忆。切换预设只影响本会话提示词，不删除资料。用户要求生图时先读取软件参数；自然语言描述先调用 langbai_jev_status，已启用则整理明确语义和成熟 Tag 候选并调用 langbai_decide_prompt。Jev 失败必须说明，不冒充已筛选。风格提示词、画师串和负面提示词保持不变；实际生成使用 langbai_generate_image，等待软件确认。其他通用 Agent 工具继续可用。'}]};
    await fs.writeFile(path.join(builtinDir,'preset.json'),JSON.stringify(preset,null,2));
    const filename=path.join(dest,'src/index.js');let code=await fs.readFile(filename,'utf8');
    code="import {installBuiltinPreset} from './studio-builtins/install.mjs';\n"+code;
    code=code.replace('  await ready\n}',"  await ready\n  const builtin=JSON.parse(await readFile(new URL('./studio-builtins/preset.json',import.meta.url),'utf8'));\n  await installBuiltinPreset(presets,config.libraryDir,builtin,current=>presetFingerprint(current)===presetFingerprint(DEFAULT_PRESET));\n}");
    await fs.writeFile(filename,code);
  }
  if(name==='dsh-roleplay-rp-library'){

    for(const file of ['src/client.js','dist/client.js']){
      const filename=path.join(dest,file);
      await fs.writeFile(filename,(await fs.readFile(filename,'utf8')).replaceAll('sidebar.footer.action','studio.extensions.content'));
    }
    const bootstrap=path.join(dest,'src/session-bootstrap.js');
    await fs.writeFile(bootstrap,(await fs.readFile(bootstrap,'utf8')).replace("{ turn: 1, step: 1, message }","{ turn: 1, step: 1, message, stream: [] }").replace('      sourceEventSeqs: [],\n',''));
  }
  if(name==='dsh-roleplay-rp-standard') {
    const entry=path.join(dest,'src/index.js');let code=await fs.readFile(entry,'utf8');
    await build({input:path.join(source,'preset-registration.mjs'),external:id=>id.startsWith('@deepseek-ai/')||id.startsWith('node:'),output:{file:path.join(dest,'src/studio-preset-registration.mjs'),format:'esm'}});
    await fs.copyFile(path.join(repo,'node_modules/js-yaml/LICENSE'),path.join(dest,'LICENSE.js-yaml'));
    code="import {registerRoleplay} from './studio-preset-registration.mjs';\n"+code;
    code=code.replace("['dshHomePath', 'rpFeatures']","['dshHomePath', 'rpFeatures', 'agentPresets']");
    code=code.replace('  const install = async () => {',"  let unregister;\n  ctx.effect(()=>()=>unregister?.(), 'studio-roleplay-registration');\n  const install = async () => {");
    code=code.replace('    await installManagedPreset(presetDirectory, files)','    await installManagedPreset(presetDirectory, files)\n    await unregister?.();\n    unregister = await registerRoleplay(ctx, presetDirectory);');
    if(!code.includes('unregister = await registerRoleplay'))throw Error('Roleplay registration adapter no longer matches upstream');
    code=code.replace('readdir, rename, rm','readdir, rename as renameOnce, rm');
    code="import {withStudioLedger,hasUserPresetChanges} from './studio-preset-preservation.js';\n"+code;
    code=code.replace('async function installManagedPreset(directory, files) {','async function installManagedPreset(directory, files) {\n  files=withStudioLedger(files);');
    code=code.replace('if (await filesMatch(directory, files)) return',"if (await filesMatch(directory, files)) return\n    if(await hasUserPresetChanges(directory)){console.warn('[Studio] 已保留自定义 Roleplay 预设；未用生成模板覆盖。');return;}");
    code+=`\n// Windows file watchers can briefly hold a newly written preset directory.\nasync function rename(from,to){for(let attempt=0;;attempt++){try{return await renameOnce(from,to);}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=7)throw error;await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));}}}\n`;
    await fs.writeFile(entry,code);
    await fs.copyFile(path.join(source,'preset-preservation.js'),path.join(dest,'src/studio-preset-preservation.js'));
    const template=path.join(dest,'presets/roleplay/agent.cordis.yml');
    await fs.writeFile(template,(await fs.readFile(template,'utf8')).replace('text: __RP_PERSONA_TEXT__','prefix: __RP_PERSONA_TEXT__'));
  }
  await fs.copyFile(path.join(rp,'LICENSE'),path.join(dest,'LICENSE'));
}
const memory=path.join(temp,'mindspace-dsh-session-memory-0.7.0.tgz/package');
await fs.cp(memory,path.join(target,'packages/mindspace-dsh-session-memory'),{recursive:true});packages.push('mindspace-dsh-session-memory');
// Remove manual Chat/Work controls; keep both memory banks and automatic host classification.
const memoryClient=path.join(target,'packages/mindspace-dsh-session-memory/lib/client.js');
await fs.writeFile(memoryClient,simplifyMemoryUI(await fs.readFile(memoryClient,'utf8')));
// Mirror existing native pages into our own child slot, without redeclaring native slots.
async function mirrorPage(file,slot,endMarker){
 const code=await fs.readFile(file,'utf8');const start=code.indexOf('ctx.slots.inject("'+slot+'"');
 const end=code.indexOf(endMarker,start)+endMarker.length;
 if(start<0||end<start)throw new Error('Missing pinned page registration: '+slot);
 const entry=code.slice(start,end).replaceAll('"'+slot+'"','"studio.extensions.page"');
 await fs.writeFile(file,code.slice(0,end)+'\n'+entry+code.slice(end));
}
await mirrorPage(memoryClient,'settings.section','}, SessionMemorySection));');
const managerSource=path.join(temp,'dsh-plugin-mgr-0.2.11.tgz/package');
const manager=path.join(target,'packages/dsh-plugin-mgr');
await fs.cp(managerSource,manager,{recursive:true});packages.push('dsh-plugin-mgr');
await mirrorPage(path.join(manager,'dist/client.js'),'settings.plugins.tab','\n\t\t})));');
// Bundle js-yaml locally: the desktop runtime must not depend on a global npm installation.
await build({input:path.join(managerSource,'dist/index.js'),external:id=>id.startsWith('@deepseek-ai/')||id.startsWith('node:'),output:{file:path.join(manager,'dist/index.js'),format:'esm'}});
await fs.copyFile(path.join(repo,'node_modules/js-yaml/LICENSE'),path.join(manager,'LICENSE.js-yaml'));
// Studio seeds live outside profile-managed dependencies. Display them without letting
// generic package updates overwrite locally editable integrations.
const managerEntry=path.join(manager,'dist/index.js');
let managerCode=await fs.readFile(managerEntry,'utf8');
managerCode=managerCode.replace('for (const [dep, spec] of Object.entries(manifest.dependencies ?? {})) {',`const studioBundled = new Set();
 const dependencies = {...manifest.dependencies};
 for(const dep of ['dsh-plugin-mgr','@langbai/dsh-studio-library','dsh-roleplay-rp-feature-manager','mindspace-dsh-session-memory']) {
  try { readFileSync(join(dirname(profileDir),'node_modules',dep,'package.json'));if(!(dep in dependencies)){dependencies[dep]='file:../node_modules/'+dep;studioBundled.add(dep);} }catch{}
 }
 for (const [dep, spec] of Object.entries(dependencies)) {`);
managerCode=managerCode.replace('readFileSync(join(profileDir, "node_modules", dep, "package.json"), "utf8")','readFileSync(join(studioBundled.has(dep)?dirname(profileDir):profileDir, "node_modules", dep, "package.json"), "utf8")');
managerCode=managerCode.replace('description = pkg.description ?? "";','description = (studioBundled.has(dep)?"软件集成组件（保留自定义文件）；通过软件兼容更新。 ":"") + (pkg.description ?? "");');
managerCode=managerCode.replace('protected: PROTECTED_PATTERNS.some((re) => re.test(dep)),','protected: studioBundled.has(dep) || PROTECTED_PATTERNS.some((re) => re.test(dep)),');
managerCode=managerCode.replace('shell,\n','shell,\n      windowsHide: true,\n');
await fs.writeFile(managerEntry,managerCode);
const market=path.join(target,'packages/dshmarket');
await fs.cp(path.join(temp,'dshmarket-1.66.1.tgz/package'),market,{recursive:true});packages.push('dshmarket');
for(const [dep,version] of Object.entries(lock.marketDependencies)){
 const folder=path.join(repo,'node_modules',dep),pkg=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));
 if(pkg.version!==version)throw Error('Market dependency mismatch: '+dep);
 await fs.cp(folder,path.join(market,'node_modules',dep),{recursive:true,dereference:true});
}
let patch=await fs.readFile(path.join(source,'roleplay.patch.yml'),'utf8');
// Optional generative enhancements remain opt-in in the upstream feature manager.
patch=patch.replace(/^          - (reply-options|subagent-manager|quick-replies|message-actions)\r?\n/gm,'');
patch+='\n- insert:\n    - id: mindspace-session-memory\n      name: mindspace-dsh-session-memory\n      config:\n        maintenanceEnabled: false\n';
patch+='\n- insert:\n    - id: studio-library\n      name: "@langbai/dsh-studio-library"\n';
patch+='\n- insert:\n    - id: studio-plugin-manager\n      name: dsh-plugin-mgr\n';
patch+='\n- insert:\n    - id: dsh-market\n      name: dshmarket\n      config:\n        allowRestart: false\n';
await fs.writeFile(path.join(target,'community.patch.yml'),patch);
// 0.1.7 requires schema factories on host AND browser RPC descriptors.
async function adaptTree(dir){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()&&entry.name!=='node_modules')await adaptTree(file);
  else if(entry.isFile()&&entry.name.endsWith('.js')){
   const text=await fs.readFile(file,'utf8'),adapted=adaptIcons(adaptSettingsScope(adaptStrictCodecs(text)));
   if(adapted!==text)await fs.writeFile(file,adapted);
  }
 }
}
await adaptTree(path.join(target,'packages'));
await fs.writeFile(path.join(target,'manifest.json'),JSON.stringify({...lock,packages},null,2));
console.log(`COMMUNITY BUILD PASS: ${packages.length} pinned packages; native package boundaries; exact ${lock.harnessServices} services; background model maintenance opt-in.`);
