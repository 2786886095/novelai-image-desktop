const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]),source=path.resolve(process.argv[3]),read=f=>fs.readFileSync(path.join(root,f)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const catalog=JSON.parse(read('dist/ui-fonts/catalog.json'));
assert.equal(catalog.length,6);const rows=[];
assert.equal(JSON.parse(read('package.json')).version,'2.5.7');
assert.ok(read('THIRD_PARTY_NOTICES.md').toString().includes('SIL Open Font License'));
for(const f of catalog){
 const bytes=read('dist/ui-fonts/'+f.file),license=read('dist/ui-fonts/'+f.licenseFile);
 assert.equal(bytes.length,f.bytes);assert.equal(sha(bytes),f.sha256);assert.equal(sha(license),f.licenseSha256);
 assert.ok(bytes.equals(fs.readFileSync(path.join(source,'public/ui-fonts',f.file))));
 assert.ok(bytes.equals(fs.readFileSync(path.join(source,'mobile/assets/ui-fonts',f.file))));
 rows.push({id:f.id,bytes:bytes.length,sha256:sha(bytes),licenseSha256:sha(license)});
}
console.log(JSON.stringify({event:'actual_packaged_fonts_assets',version:'2.5.7',pass:true,fonts:rows}));
