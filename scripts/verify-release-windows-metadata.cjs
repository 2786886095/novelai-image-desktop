const fs=require('node:fs'),assert=require('node:assert/strict');
const {readReleaseVersion}=require('./release-version.cjs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const version=readReleaseVersion(process.cwd());assert.equal(lock.version,version);assert.equal(lock.packages[''].version,version);
const mobileVersion=fs.readFileSync('mobile/pubspec.yaml','utf8').match(/^version:\s+(\S+)\s*$/m)?.[1];
assert.match(mobileVersion||'',new RegExp('^'+version.replaceAll('.', '\\.')+'\\+\\d+$'));
assert.ok(fs.readFileSync('mobile/lib/models/nai_models.dart','utf8').includes(`const appVersion = '${version}';`));
assert.ok(fs.readFileSync('electron/ipc/mcp-client.ts','utf8').includes(`version: "${version}"`));
const locales=JSON.parse(fs.readFileSync('shared/agent-ux-locales.json','utf8'));
assert.ok(JSON.stringify(locales).includes('使用酒馆'));
// Current page entries move with Latest/main; real package/build versions above remain required.
const repo='https://github.com/OldLi1337/novelai-image-desktop';
for(const file of ['README.md','README.en.md','README.ja.md','README.ko.md','README.zh-TW.md']) {
 const readme=fs.readFileSync(file,'utf8');
 assert.ok(!readme.includes('gitee.com'),file+': unexpected release host');
 assert.ok(readme.includes(repo+'/releases/latest'),file+': Latest entry missing');
 assert.ok(readme.includes(repo+'/tree/main'),file+': main source entry missing');
 const links=readme.match(/https?:\/\/[^\s)\]<>"']+\/releases(?:\/[^\s)\]<>"']*)?/g)||[];
 assert.ok(links.length>0,file+': release links missing');
 for(const link of links)assert.equal(link,repo+'/releases/latest',file+': fixed release entry');
 assert.doesNotMatch(readme.split(/\r?\n/).slice(0,12).join('\n'),/\bv?\d+\.\d+\.\d+\b/i,file+': fixed current version');
 const download=readme.split(/^## /m).find(section=>/^(下载与安装|Installation and updates|インストールと更新|설치 및 업데이트|下載與更新)\r?\n/.test(section));
 assert.equal(typeof download,'string',file+': current download section missing');
 assert.doesNotMatch(download,/\bv?\d+\.\d+\.\d+\b/i,file+': fixed current download version');
}
const notes=fs.readFileSync('docs/RELEASE_NOTES.md','utf8');
const entries=[...notes.matchAll(/^##\s+.+$/gm)];
assert.equal(entries.length,1,'release notes must contain only the current update');
const first=notes.slice(entries[0].index);
assert.match(entries[0][0],/^## Latest\b/);
assert.ok(first.includes(repo+'/releases/latest'));
assert.ok(first.includes(repo+'/tree/main'));
assert.doesNotMatch(first,/\bv?\d+\.\d+\.\d+\b|\/releases\/(?:tag|download)\/|\/(?:tree|blob|commit)\/[a-f0-9]{7,40}\b/i);
assert.match(fs.readFileSync('docs/history/RELEASE_NOTES-through-2.5.8.md','utf8'),/\bv?\d+\.\d+\.\d+\b/);
console.log(JSON.stringify({version,mobile:mobileVersion,scope:'Windows x64 binaries; shared Android/iOS source',label:'使用酒馆',pass:true}));
