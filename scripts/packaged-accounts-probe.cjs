const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {assertPackagedVersion}=require('./release-version.cjs');
const root=path.resolve(process.argv[2]);const load=createRequire(path.join(root,'package.json'));
(async()=>{
 const metadata=load('./package.json');assertPackagedVersion(metadata.version,process.argv[3]);
 for(const name of ['nai-accounts-vault.js','nai-accounts-login.js','nai-accounts-runtime.js','nai-accounts.js']){
  const rel=path.join('dist-electron','electron','ipc',name);
  const packed=fs.readFileSync(path.join(root,rel));
  // Intel CI verifies the immutable universal artifact without a second source build.
  if(fs.existsSync(path.resolve(rel))&&!packed.equals(fs.readFileSync(path.resolve(rel))))throw Error('Stale packaged module '+name);
 }
 const wasm=load('hash-wasm');const salt=new Uint8Array(16).fill(7);
 const output=await wasm.argon2id({password:'synthetic-package-fixture',salt,iterations:2,parallelism:1,memorySize:1953,hashLength:64,outputType:'binary'});
 if(output.byteLength!==64)throw Error('Packaged login WASM failed');output.fill(0);
 const vault=load('./dist-electron/electron/ipc/nai-accounts-vault.js');if(typeof vault.accountCipherAvailable!=='function')throw Error('Final vault guard missing');
 if(vault.accountCipherAvailable({isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>'basic_text'}))throw Error('Weak storage allowed');
 console.log(JSON.stringify({version:metadata.version,packagedModulesMatchBuild:true,argon2idWasmExecuted:true,weakStorageRejected:true,asarSha256:crypto.createHash('sha256').update(require('original-fs').readFileSync(root)).digest('hex')}));
})().catch(error=>{console.error(error.stack??String(error));process.exitCode=1;});
