import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {gzipSync} from 'node:zlib';
vi.mock('./download-request',()=>({updateFetch:vi.fn()}));
import {updateFetch} from './download-request';
import {registryUrl,verifyArchive,unpackNpm,startOfficialRegistry,planOfficialRuntime,stageOfficialCommunity} from './harness-official-runtime';
import {HarnessDownloadConsent} from './harness-download-consent';
const fetcher=vi.mocked(updateFetch),roots:string[]=[];
const pkg={name:'@deepseek-ai/dsh',version:'0.2.0-rc.2',dist:{tarball:'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.0-rc.2.tgz',integrity:'sha512-'+'a'.repeat(86)+'=='}};
afterEach(async()=>{fetcher.mockReset();for(const r of roots.splice(0))if(path.dirname(r)===os.tmpdir()&&path.basename(r).startsWith('official-update-'))await fs.rm(r,{recursive:true,force:true});});
async function directory(){const r=await fs.mkdtemp(path.join(os.tmpdir(),'official-update-'));roots.push(r);return r;}
function tar(name:string,body='ok',type='0'){
 const h=Buffer.alloc(512);h.write(name,0);h.write('0000644\0',100);h.write(body.length.toString(8).padStart(11,'0')+'\0',124);h.fill(32,148,156);h.write(type,156);h.write('ustar\0',257);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);
 return gzipSync(Buffer.concat([h,Buffer.from(body),Buffer.alloc((512-body.length%512)%512+1024)]));
}
it('validates the bootstrap SRI and limits registry origins',()=>{
 const b=Buffer.from('npm'),s='sha512-'+crypto.createHash('sha512').update(b).digest('base64');expect(()=>verifyArchive(b,s)).not.toThrow();expect(()=>verifyArchive(Buffer.from('bad'),s)).toThrow();
 for(const u of ['http://registry.npmjs.org/npm','https://evil.test/npm','https://user@registry.npmjs.org/npm'])expect(()=>registryUrl(u)).toThrow();
});
it('extracts plain package files and rejects traversal and links',async()=>{
 const root=await directory();await unpackNpm(tar('package/bin/npm-cli.js'),root,new AbortController().signal);expect(await fs.readFile(path.join(root,'bin/npm-cli.js'),'utf8')).toBe('ok');
 for(const [n,t] of [['package/../escape','0'],['package/link','2'],['outside/file','0']])await expect(unpackNpm(tar(n,'ok',t),root,new AbortController().signal)).rejects.toThrow();
});
it('plans exact upstream and installer metadata without downloading any archive',async()=>{
 const root=await directory(),slot=path.join(root,'versions/current');await fs.mkdir(slot,{recursive:true});await fs.writeFile(path.join(root,'active.json'),JSON.stringify({slot:'current'}));
 await fs.writeFile(path.join(slot,'manifest.json'),JSON.stringify({format:1,protocol:1,version:'0.1.7',upstream:'0.1.7-rc.2',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files:{'node.exe':'a'.repeat(64),'runtime/bin.js':'b'.repeat(64)}}));
 fetcher.mockImplementation(async url=>new Response(JSON.stringify(url.includes('/npm/')?{...pkg,name:'npm',version:'10.9.4'}:pkg)));
 const plan=await planOfficialRuntime(root,pkg.version,new AbortController().signal);expect(plan).toMatchObject({version:pkg.version,kind:'official-runtime',bytes:0});expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls.some(([u])=>u.includes('.tgz'))).toBe(false);
 const consent=new HarnessDownloadConsent<typeof plan>();const offered=consent.issue(plan,'official',false);expect(consent.consume(offered.token,'official').asset.package.dist.integrity).toBe(pkg.dist.integrity);expect(()=>consent.consume(offered.token,'official')).toThrow();
});
it('routes metadata and tarballs through the update transport and rejects foreign URLs',async()=>{
 fetcher.mockResolvedValue(new Response(JSON.stringify({versions:{[pkg.version]:pkg}})));
 const gateway=await startOfficialRegistry(new AbortController().signal,()=>{},pkg);
 try{
  const res=await fetch(gateway.url+'%40deepseek-ai%2Fdsh'),body=await res.json();const url=body.versions[pkg.version].dist.tarball;expect(url.startsWith(gateway.url)).toBe(true);
  fetcher.mockResolvedValue(new Response(Buffer.from('archive')));expect(await(await fetch(url)).text()).toBe('archive');expect(fetcher.mock.lastCall?.[0]).toBe(pkg.dist.tarball);
  expect((await fetch(gateway.url+'asset?url='+encodeURIComponent('https://evil.test/file'))).status).toBe(502);
  expect((await fetch(new URL('/invalid/npm',gateway.url))).status).toBe(403);
 }finally{await gateway.close();}
});
it('changed top-level package metadata fails before an archive can be selected',async()=>{
 fetcher.mockResolvedValue(new Response(JSON.stringify({...pkg,dist:{...pkg.dist,integrity:'sha512-changed'}})));const gateway=await startOfficialRegistry(new AbortController().signal,()=>{},pkg);
 try{expect((await fetch(gateway.url+'%40deepseek-ai%2Fdsh')).status).toBe(502);}finally{await gateway.close();}
});
it('candidate exact-version declarations are rehashed, not replaced with a wildcard',async()=>{
 const root=await directory(),relative='community/packages/dsh-roleplay-rp-feature-manager/src/catalog.js',files:Record<string,string>={};
 for(const [name,body]of Object.entries({'community/manifest.json':JSON.stringify({harnessServices:'0.1.7-rc.2',packages:['dsh-roleplay-rp-feature-manager']}),[relative]:"export const SUPPORTED_DSH_RANGE = '0.1.7-rc.2'"})){
  const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,body);files[name]=crypto.createHash('sha256').update(body).digest('hex');
 }
 await stageOfficialCommunity(root,files,pkg.version);const actual=await fs.readFile(path.join(root,relative),'utf8');expect(actual).toContain("SUPPORTED_DSH_RANGE = '0.2.0-rc.2'");expect(files[relative]).toBe(crypto.createHash('sha256').update(actual).digest('hex'));
 await fs.writeFile(path.join(root,relative),'custom changes');await expect(stageOfficialCommunity(root,files,'0.2.0-rc.3')).rejects.toThrow('changed');
});
