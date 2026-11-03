import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const fixture=vi.hoisted(()=>({dir:''}));
vi.mock('electron',()=>({app:{getPath:()=>fixture.dir},dialog:{},shell:{}}));
vi.mock('./ipc/store',()=>({getSettings:()=>({loggingEnabled:true,logDir:fixture.dir})}));
import {appendLog,logError,installGlobalLogging} from './ipc/logger';
import {rememberRelaySecret} from './relay-import-redaction';
it('real file logger and mirrored console never retain link, code, quoted Bearer or token; keep HTTP status',()=>{
 fixture.dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-real-log-'));
 const code='L'.repeat(43),token='virtual-import-secret-777',url='langbai-novelai://relay/import?code='+code;
 rememberRelaySecret(code);rememberRelaySecret(token);
 const originalError=console.error,originalWarn=console.warn,errors=process.listeners('uncaughtException'),rejections=process.listeners('unhandledRejection');const mirror=vi.fn();console.error=mirror;console.warn=mirror;
 try{
  appendLog('INFO',JSON.stringify({url,code,apiToken:token,status:401}));
  logError('fixture',new Error('HTTP403 '+url+' Bearer "'+token+'"'));
  installGlobalLogging();console.error({Authorization:'Bearer "'+token+'"',url,code,status:400});console.warn('Bearer \''+token+'\' HTTP502');
  const text=fs.readFileSync(path.join(fixture.dir,'app.log'),'utf8');const consoleText=JSON.stringify(mirror.mock.calls);
  for(const value of [url,code,token]){expect(text).not.toContain(value);expect(consoleText).not.toContain(value);}
  for(const value of ['401','403','400','502'])expect(text).toContain(value);
 }finally{console.error=originalError;console.warn=originalWarn;for(const f of process.listeners('uncaughtException'))if(!errors.includes(f))process.removeListener('uncaughtException',f);for(const f of process.listeners('unhandledRejection'))if(!rejections.includes(f))process.removeListener('unhandledRejection',f);fs.rmSync(fixture.dir,{recursive:true,force:true});}
});
