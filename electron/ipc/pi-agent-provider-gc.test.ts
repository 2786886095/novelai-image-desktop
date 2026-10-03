import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('actual studioPiFetch keeps cancellation alive after its temporary Request is collected', () => {
  const source = fs.readFileSync(path.resolve('electron/ipc/pi-agent-provider.ts'), 'utf8');
  const ast = ts.createSourceFile('provider.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'studioPiFetch');
  expect(declaration).toBeDefined();
  const js = ts.transpileModule(declaration!.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const worker = `
const http=require('node:http'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const axios=require(${JSON.stringify(require.resolve('axios'))});
const proxyConfigForUrl=async()=>({proxy:false});const agentProviderRequiresApiKey=()=>false;
${js}
const controller=new AbortController();let response,timer,abortAt,closeAt,closed=false,count=0;
const server=http.createServer((req,res)=>{response=res;res.writeHead(200);res.write('initial');timer=setInterval(()=>{count++;res.write('next');},50);res.on('close',()=>{closed=true;closeAt=Date.now();clearInterval(timer);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let error,deadline;
try{const res=await studioPiFetch({agentApiKey:'',proxyForAi:false})('http://127.0.0.1:'+server.address().port,{signal:controller.signal});
deadline=setTimeout(()=>response.destroy(),2500);setTimeout(()=>global.gc(),100);setTimeout(()=>{abortAt=Date.now();controller.abort();},500);
try{for await(const _ of res.body){}}catch(e){error=String(e);}await new Promise(r=>setTimeout(r,50));
console.log(JSON.stringify({event:'actual_fetch_gc_cancel',forcedGc:typeof global.gc==='function',closed,count,abortAt,closeAt,elapsedAfterAbort:closeAt-abortAt,error}));
assert(error&&closed&&closeAt-abortAt<1000,'Upstream must close on user abort, not diagnostic destruction');
}finally{clearTimeout(deadline);clearInterval(timer);response?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
`;
  const child = spawnSync(process.execPath, ['--expose-gc', '-'], { input: worker, encoding: 'utf8', timeout: 8000, windowsHide: true });
  expect(child.error, child.stderr).toBeUndefined();
  expect(child.status, child.stdout + child.stderr).toBe(0);
  const receipt = JSON.parse(child.stdout.trim());
  expect(receipt.forcedGc).toBe(true);
  expect(receipt.closed).toBe(true);
  expect(receipt.elapsedAfterAbort).toBeLessThan(1000);
});
