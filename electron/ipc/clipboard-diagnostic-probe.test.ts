import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {PNG} from 'pngjs';
import {copyImageWithMetadata} from './image-clipboard';
import {writeWindowsPngClipboard} from './windows-png-clipboard';
import * as nativeWriter from './windows-png-clipboard';
import {toLocalMediaUrl} from './local-media-protocol';
const {pngWithComment}=require('../../tests/image-clipboard-fixture.cjs');
const fixture=vi.hoisted(()=>({spawn:vi.fn(),readBuffer:vi.fn(),readImage:vi.fn(),root:'',intended:Buffer.alloc(0)}));
vi.mock('node:child_process',()=>({spawn:fixture.spawn}));
vi.mock('electron',()=>({app:{getPath:()=>fixture.root},clipboard:{readBuffer:fixture.readBuffer,readImage:fixture.readImage,writeBuffer:vi.fn(),availableFormats:()=>[]}}));
let child:any;const secret='PRIVATE_PATH_PROMPT_ACCOUNT_TOKEN_DO_NOT_LOG';
beforeEach(async()=>{
 vi.resetAllMocks();fixture.root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'copy-diag-fixture-')));
 child=Object.assign(new EventEmitter(),{stderr:new EventEmitter(),stdin:Object.assign(new EventEmitter(),{end:vi.fn((data:string)=>fixture.intended=Buffer.from(data,'base64'))}),kill:vi.fn()});
 fixture.spawn.mockReturnValue(child);fixture.readBuffer.mockImplementation(()=>fixture.intended);fixture.readImage.mockReturnValue({isEmpty:()=>false});
});
afterEach(async()=>{vi.useRealTimers();await fs.rm(fixture.root,{recursive:true,force:true});});
async function copy({diagnostics=true,keep=true,stderr='',event='close',exit=1,alter=false,empty=false}:any={}){
 const original=pngWithComment();const file=path.join(fixture.root,'private-source.png');await fs.writeFile(file,original);
 const pending=copyImageWithMetadata(toLocalMediaUrl(file),keep,diagnostics);
 await vi.waitFor(()=>expect(fixture.spawn).toHaveBeenCalledOnce());
 if(stderr)child.stderr.emit('data',Buffer.from(stderr));
 if(alter)fixture.readBuffer.mockReturnValue(Buffer.alloc(0));if(empty)fixture.readImage.mockReturnValue({isEmpty:()=>true});
 child.emit(event,event==='error'?new Error(secret):exit);
 const result=await pending;expect(await fs.readFile(file)).toEqual(original);expect(JSON.stringify(result)).not.toContain(secret);return {result,original,intended:fixture.intended};
}
it('same failed native operation is classifiable only when main explicitly opts into bounded diagnostics',async()=>{
 const {result}=await copy({stderr:'IMAGE_COPY_DIAG_V1|native-publish-cleanup|0x800401D0\n'});
 console.log('COPY_DIAG_REPLAY '+JSON.stringify({status:result.status,diagnostic:result.diagnostic??null}));
 expect(result.status).toBe('failed');expect(result.diagnostic).toEqual({phase:'native-publish-cleanup',errorCode:'NATIVE_SCRIPT_FAILED',hresult:'0x800401D0'});
});
it('default callers still receive exactly status-only failure and stderr remains ignored',async()=>{
 const {result}=await copy({diagnostics:false,stderr:secret});expect(result).toEqual({status:'failed'});expect(fixture.spawn.mock.calls[0][2].stdio).toEqual(['pipe','ignore','ignore']);
});
it.each(['native-load','native-decode','native-data','native-publish-cleanup'])('known script phase %s survives without exception text',async phase=>{
 const {result}=await copy({stderr:`IMAGE_COPY_DIAG_V1|${phase}|0x80004005\n`});expect(result.status).toBe('failed');expect(result.diagnostic).toEqual({phase,errorCode:'NATIVE_SCRIPT_FAILED',hresult:'0x80004005'});
});
it('unknown HRESULT is omitted rather than serialized',async()=>{
 const {result}=await copy({stderr:'IMAGE_COPY_DIAG_V1|native-load|0xDEADBEEF\n'});expect(result.status).toBe('failed');expect(result.diagnostic).toEqual({phase:'native-load',errorCode:'NATIVE_SCRIPT_FAILED'});
});
it.each([secret,'IMAGE_COPY_DIAG_V1|'+secret+'|0x80004005\n','IMAGE_COPY_DIAG_V1|native-load|0x80004005\n'+secret,secret.repeat(100)])('malformed, extra or oversized stderr is reduced to a fixed diagnostic (%#)',async stderr=>{
 const {result}=await copy({stderr});expect(result.status).toBe('failed');expect(result.diagnostic).toEqual({phase:'native-process',errorCode:'NATIVE_DIAGNOSTIC_INVALID'});expect(JSON.stringify(result).length).toBeLessThan(200);
});
it('spawn failure is distinct without returning arbitrary Error.message',async()=>{
 const {result}=await copy({event:'error'});expect(result).toEqual({status:'failed',diagnostic:{phase:'native-process',errorCode:'NATIVE_SPAWN_FAILED'}});
});
it('native latency stays exactly 10000ms and remains failed on timeout',async()=>{
 vi.useFakeTimers();const pending=writeWindowsPngClipboard(Buffer.from(secret),true);const caught=pending.catch(e=>e);await vi.advanceTimersByTimeAsync(10000);const error=await caught;
 expect(error.message).toBe('IMAGE_COPY_NATIVE_FAILED');expect(error.diagnostic).toEqual({phase:'native-process',errorCode:'NATIVE_TIMEOUT'});expect(child.kill).toHaveBeenCalledOnce();expect(JSON.stringify(error)).not.toContain(secret);
});
it('zero exit plus identical original bytes and native bitmap still means copied, not a diagnostic failure',async()=>{
 const {result,original,intended}=await copy({exit:0,stderr:secret});expect(result).toEqual({status:'copied'});expect(intended).toEqual(original);
});
it('OFF successful sanitization, source bytes and pixel bounds are not weakened by diagnostics',async()=>{
 const {result,original,intended}=await copy({exit:0,keep:false});expect(result).toEqual({status:'copied'});expect(intended).not.toEqual(original);const pixels=PNG.sync.read(intended);expect(pixels.data.every((v,i)=>i%4===3?!(v&1):!(v&1))).toBe(true);
});
it('raw PNG mismatch stays failed and is distinguished from an empty native bitmap',async()=>{
 const {result}=await copy({exit:0,alter:true});expect(result).toEqual({status:'failed',diagnostic:{phase:'png-readback',errorCode:'PNG_READBACK_MISMATCH'}});
});
it('empty native bitmap stays failed after successful exact raw-byte readback',async()=>{
 const {result}=await copy({exit:0,empty:true});expect(result).toEqual({status:'failed',diagnostic:{phase:'bitmap-readback',errorCode:'BITMAP_EMPTY'}});
});
it('missing registered source returns only a fixed IO code with no URL or path',async()=>{
 const result=await copyImageWithMetadata(toLocalMediaUrl(path.join(fixture.root,secret+'.png')),true,true);expect(result).toEqual({status:'failed',diagnostic:{phase:'source-read',errorCode:'SOURCE_IO_FAILED'}});expect(JSON.stringify(result)).not.toContain(secret);
});

it('accessor-backed native error fields are read once and cannot swap in private data',async()=>{
 const file=path.join(fixture.root,'getter-source.png');await fs.writeFile(file,pngWithComment());let reads=0;
 const diagnostic={get phase(){return ++reads===1?'native-process':secret},errorCode:'NATIVE_EXIT_FAILED',hresult:'0xDEADBEEF'};
 const spy=vi.spyOn(nativeWriter,'writeWindowsPngClipboard').mockRejectedValue(Object.assign(new Error(secret),{diagnostic}));
 try{const result=await copyImageWithMetadata(toLocalMediaUrl(file),true,true);expect(result).toEqual({status:'failed',diagnostic:{phase:'native-process',errorCode:'NATIVE_EXIT_FAILED'}});expect(reads).toBe(1);expect(JSON.stringify(result)).not.toContain(secret);}finally{spy.mockRestore();}
});
