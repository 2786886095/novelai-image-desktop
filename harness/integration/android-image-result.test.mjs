import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
test('actual Flutter bridge response renders an image through actual shared Harness plugin without new generation',async()=>{
 const response=JSON.parse(await fs.readFile('artifacts/agent-api-integration-20260927/android-image-result.json','utf8'));
 assert.equal(response.ok,true);assert.equal(response.generatedImages.length,1);
 const originalFetch=globalThis.fetch,oldEnv={...process.env};
 process.env.STUDIO_DSH_TOOLS=path.resolve('.tmp/harness-component015/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js');process.env.STUDIO_BRIDGE_URL='http://127.0.0.1:1';process.env.STUDIO_BRIDGE_TOKEN='fixture';delete process.env.STUDIO_WORKSPACE;
 let requests=0,saves=0;const registered=new Map();
 globalThis.fetch=async()=>{requests++;return {ok:true,json:async()=>response};};
 try {
  let source=await fs.readFile('harness/plugins/studio-tools/index.js','utf8');
  for(const file of ['jev','jev-config'])source=source.replaceAll(`'@langbai/dsh-studio-library/${file}'`,JSON.stringify(pathToFileURL(path.resolve(`harness/plugins/studio-library/${file}.js`)).href));
  const plugin=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  await plugin.apply({tools:{register:t=>registered.set(t.name,t)},get:key=>key==='attachments'?{saveImage:async image=>{assert.equal(image.mediaType,'image/png');assert.equal(image.data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');saves++;return {id:'render-fixture',mediaType:image.mediaType};}}:undefined});
  const tool=registered.get('langbai_generate_image');const result=await tool.execute({args:{positivePrompt:'fixture scene',count:1}},{callId:'fixture-only',agent:{session:{id:'one'}}});
  assert.equal(requests,1);assert.equal(saves,1);assert.equal(result.studioImageAttachments[0].id,'render-fixture');
  assert.ok(tool.output.render({},result).some(x=>x.type==='image'&&x.attachment.id==='render-fixture'));assert.equal(result.previewWarnings,undefined);
 }finally{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
});
