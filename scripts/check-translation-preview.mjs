import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'studio-translation-regression-'));
const report=path.join(temp,'report.json');
let server;
try {
 server=await createServer({root,configFile:path.join(root,'vite.config.ts'),logLevel:'error',cacheDir:path.join(temp,'vite'),
  server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/*']}},
  plugins:[{name:'translation-test-shell',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
   if(req.url!='/__translation_regression__')return next();
   res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><title>Translation regression</title><div id="fixture"></div>'));
  });}}]});
 await server.listen();
 const port=server.httpServer.address().port;
 const probe=path.join(temp,'probe.cjs');fs.copyFileSync(path.join(root,'scripts/translation-preview-probe.cjs'),probe);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const child=spawn(createRequire(import.meta.url)('electron'),[probe,String(port),root,report],{env,windowsHide:true});
 let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Translation UI gate timed out'));},90000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',c=>{clearTimeout(timer);resolve(c);});});
 process.stdout.write(stdout);process.stderr.write(stderr);
 if(code!==0||!fs.existsSync(report))throw Error('Translation UI gate failed: '+code);
 const result=JSON.parse(fs.readFileSync(report,'utf8'));
 if(result.passed!==result.total||result.total!==12||!result.sandbox||result.nodeIntegration!==false)throw Error('Incomplete translation UI matrix');
}catch(e){console.error(e.stack??e);process.exitCode=1;}
finally{await server?.close();/* Preserve uniquely created reports/profile for diagnostic readback. */}
