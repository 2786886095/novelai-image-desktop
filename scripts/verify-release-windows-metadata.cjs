const fs=require('node:fs'),assert=require('node:assert/strict');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
assert.equal(pkg.version,'2.4.7');assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
assert.match(fs.readFileSync('mobile/pubspec.yaml','utf8'),/^version: 2\.4\.7\+166$/m);
assert.ok(fs.readFileSync('mobile/lib/models/nai_models.dart','utf8').includes("const appVersion = '2.4.7';"));
assert.ok(fs.readFileSync('electron/ipc/mcp-client.ts','utf8').includes('version: "2.4.7"'));
const locales=JSON.parse(fs.readFileSync('shared/agent-ux-locales.json','utf8'));
assert.ok(JSON.stringify(locales).includes('使用酒馆'));
console.log(JSON.stringify({version:pkg.version,mobile:'2.4.7+166',scope:'Windows x64 binaries; shared Android/iOS source',label:'使用酒馆',pass:true}));
