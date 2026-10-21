import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assertNoComfyPathLinks, locationContains } from './comfyui-location-policy';

export const COMFY_ARCHIVE_EXECUTOR_SHA256 = '15d4c788c148e3677e2fc1c4a01f191fb6669eba4f6acf8a465f0f1a6f1e1260';
export interface ComfyArchiveLimits { maxEntries: number; maxBytes: number; maxEntryBytes: number; maxRatio: number; maxPathChars: number; maxListingBytes: number; timeoutMs: number }
export const COMFY_ARCHIVE_LIMITS: ComfyArchiveLimits = { maxEntries: 200_000, maxBytes: 80 * 1024 ** 3, maxEntryBytes: 16 * 1024 ** 3, maxRatio: 1000, maxPathChars: 240, maxListingBytes: 96 * 1024 ** 2, timeoutMs: 30 * 60_000 };
export interface ComfyArchiveEntry { name: string; size: number; crc: string; directory: boolean; sourceName?: string }
export interface ComfyArchiveManifest { archivePath: string; bytes: number; sha256: string; format: 'zip' | '7z'; entries: ComfyArchiveEntry[]; totalBytes: number; executorPath: string; warnings: string[] }
export interface ComfyArchiveOptions { signal?: AbortSignal; limits?: Partial<ComfyArchiveLimits>; executorPath?: string; onProgress?: (completed: number, total: number) => void }
export function throwIfComfyAborted(signal?: AbortSignal): void { if (signal?.aborted) throw new Error('COMFY_INSTALL_CANCELLED'); }
export async function hashComfyFile(file: string, signal?: AbortSignal): Promise<string> {
  throwIfComfyAborted(signal); const hash = createHash('sha256'); const stream = createReadStream(file);
  const abort = () => stream.destroy(new Error('COMFY_INSTALL_CANCELLED')); signal?.addEventListener('abort', abort, { once: true });
  try { for await (const chunk of stream) { throwIfComfyAborted(signal); hash.update(chunk); } return hash.digest('hex'); }
  finally { signal?.removeEventListener('abort', abort); stream.destroy(); }
}
export function validateArchiveEntries(input: ComfyArchiveEntry[], overrides: Partial<ComfyArchiveLimits> = {}): ComfyArchiveEntry[] {
  const limits = { ...COMFY_ARCHIVE_LIMITS, ...overrides }; let bytes = 0;
  if (!input.length || input.length > limits.maxEntries) throw new Error('COMFY_ARCHIVE_ENTRY_LIMIT');
  const seen = new Map<string, boolean>(); const spellings=new Map<string,string>();
  const entries = input.map(entry => {
    const name = entry.name.replace(/\\/g, '/').replace(entry.directory ? /\/$/ : /$^/, '');
    if (!name || name.length > limits.maxPathChars || /[\x00-\x1f\x7f:<>"|?*]/.test(name) || name.startsWith('/') || name.startsWith('@') || name.includes('//')) throw new Error('COMFY_ARCHIVE_PATH');
    const parts = name.split('/');
    if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(p))) throw new Error('COMFY_ARCHIVE_PATH');
    const key = name.normalize('NFC').toLowerCase();
    for(let i=1;i<=parts.length;i++){const spelling=parts.slice(0,i).join('/');const normalized=spelling.normalize('NFC').toLowerCase();if(spellings.has(normalized)&&spellings.get(normalized)!==spelling)throw new Error('COMFY_ARCHIVE_COLLISION');spellings.set(normalized,spelling);}
    if (seen.has(key)) throw new Error('COMFY_ARCHIVE_COLLISION'); seen.set(key, entry.directory);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > limits.maxEntryBytes || (entry.directory && entry.size !== 0)) throw new Error('COMFY_ARCHIVE_SIZE_LIMIT');
    bytes += entry.size; if (bytes > limits.maxBytes) throw new Error('COMFY_ARCHIVE_SIZE_LIMIT');
    if (!entry.directory && !/^[0-9a-f]{8}$/i.test(entry.crc)) throw new Error('COMFY_ARCHIVE_CRC_REQUIRED');
    return { ...entry, name, sourceName: entry.sourceName || entry.name };
  });
  for (const key of seen.keys()) { let parent = key; while (parent.includes('/')) { parent = parent.slice(0, parent.lastIndexOf('/')); if (seen.get(parent) === false) throw new Error('COMFY_ARCHIVE_COLLISION'); } }
  return entries;
}
/** Strict technical listing grammar. Unknown fields/continuations fail closed; the archiver never writes paths. */
export function parseSevenZipListing(text: string, limits: Partial<ComfyArchiveLimits> = {}): ComfyArchiveEntry[] {
  const marker = '----------\n'; const normalized = text.replace(/\r\n/g, '\n'); const index = normalized.startsWith(marker)?0:normalized.indexOf('\n'+marker)+1;
  if ((index===0&&!normalized.startsWith(marker)) || normalized.indexOf('\n'+marker, index + marker.length) >= 0) throw new Error('COMFY_ARCHIVE_LISTING');
  const blocks = normalized.slice(index + marker.length).trimEnd().split('\n\n');
  const allowed = new Set(['Path','Folder','Size','Packed Size','Modified','Created','Accessed','Attributes','CRC','Encrypted','Method','Block','Host OS','Version','Volume Index','Offset','Characteristics','Comment']);
  const entries = blocks.map(block => {
    const fields = new Map<string,string>();
    for (const line of block.split('\n')) {
      const match = /^([A-Za-z][A-Za-z ]*) = (.*)$/.exec(line);
      if (!match || fields.has(match[1]) || !allowed.has(match[1])) throw new Error('COMFY_ARCHIVE_LISTING_AMBIGUOUS'); fields.set(match[1],match[2]);
    }
    const attributes = fields.get('Attributes') || '';
    if (fields.get('Encrypted') !== '-' || /^.*\bl[rwx-]{9}\b/.test(attributes) || /(?:^| )l[rwx-]{9}(?: |$)/.test(attributes) || /Reparse|Symbolic|Hard Link/i.test(block)) throw new Error('COMFY_ARCHIVE_LINK_OR_ENCRYPTED');
    // Unix regular file/dir permission strings accepted; all other Unix special types rejected.
    const unix = attributes.match(/(?:^| )([a-z-])[rwxStTs-]{9}(?: |$)/); if (unix && !['-','d'].includes(unix[1])) throw new Error('COMFY_ARCHIVE_LINK_OR_SPECIAL');
    const directory = fields.get('Folder') === '+' || /D/.test(attributes.split(' ')[0]);
    const rawSize = fields.get('Size'); if (!rawSize || !/^\d+$/.test(rawSize) || !fields.has('Path')) throw new Error('COMFY_ARCHIVE_LISTING');
    if ((fields.get('Comment') || '') !== '') throw new Error('COMFY_ARCHIVE_LISTING_AMBIGUOUS');
    return { name:fields.get('Path')!,sourceName:fields.get('Path')!,size:Number(rawSize),crc:fields.get('CRC') || (Number(rawSize)===0?'00000000':''),directory };
  });
  return validateArchiveEntries(entries,limits);
}
async function executor(explicit?: string): Promise<string> {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('COMFY_ARCHIVE_EXECUTOR_UNAVAILABLE');
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = explicit ? [explicit] : [resources && path.join(resources,'comfy-archive','win32-x64','7za.exe'),path.resolve(__dirname,'../../build/vendor/comfy-archive/win32-x64/7za.exe'),path.resolve(__dirname,'../../../build/vendor/comfy-archive/win32-x64/7za.exe')].filter((p):p is string=>!!p);
  for (const candidate of candidates) {
    try { await assertNoComfyPathLinks(candidate); if (!(await fs.lstat(candidate)).isFile()) continue; if ((await hashComfyFile(candidate)) !== COMFY_ARCHIVE_EXECUTOR_SHA256) throw new Error('COMFY_ARCHIVE_EXECUTOR_HASH'); return await fs.realpath(candidate); }
    catch(error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
  }
  throw new Error('COMFY_ARCHIVE_EXECUTOR_UNAVAILABLE');
}
function tool(exe: string,args: string[],options: ComfyArchiveOptions, consume: (stdout: NodeJS.ReadableStream)=>Promise<void>): Promise<void> {
  throwIfComfyAborted(options.signal); const limits={...COMFY_ARCHIVE_LIMITS,...options.limits};
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});
    let stderr='',failure:Error|undefined,closed=false,consumed=false;
    const fail=(error:Error)=>{if(!failure)failure=error;child.kill();};
    const abort=()=>fail(new Error('COMFY_INSTALL_CANCELLED'));
    const timer=setTimeout(()=>fail(new Error('COMFY_ARCHIVE_TIMEOUT')),limits.timeoutMs);
    const cleanup=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);};
    const finish=()=>{if(!closed||!consumed)return;cleanup();failure?reject(failure):resolve();};
    child.stderr.on('data',(b:Buffer)=>{if(Buffer.byteLength(stderr)+b.length>64*1024)fail(new Error('COMFY_ARCHIVE_STDERR_LIMIT'));else stderr+=b.toString('utf8');});
    child.once('error',e=>{failure=e;closed=true;finish();});
    child.once('close',code=>{closed=true;if(code!==0&&!failure)failure=new Error(`COMFY_ARCHIVE_EXIT_${code}: ${stderr.slice(-4000)}`);finish();});
    options.signal?.addEventListener('abort',abort,{once:true}); if(options.signal?.aborted)abort();
    consume(child.stdout).then(()=>{consumed=true;finish();},e=>{fail(e instanceof Error?e:new Error(String(e)));consumed=true;finish();});
  });
}
export async function inspectComfyArchive(input: string, options: ComfyArchiveOptions = {}): Promise<ComfyArchiveManifest> {
  throwIfComfyAborted(options.signal);if(!path.isAbsolute(input)||(process.platform==='win32'&&!/^[A-Za-z]:[\\/]/.test(input))||/[\0\r\n]/.test(input)||/^(?:\\\\|\/\/)/.test(input))throw new Error('COMFY_ARCHIVE_INPUT');await assertNoComfyPathLinks(input); const archivePath=await fs.realpath(input),stat=await fs.stat(archivePath);
  if(!stat.isFile()||stat.size<=0||stat.size>COMFY_ARCHIVE_LIMITS.maxBytes)throw new Error('COMFY_ARCHIVE_INPUT');
  const handle=await fs.open(archivePath,'r');const head=Buffer.alloc(8);try{await handle.read(head,0,8,0);}finally{await handle.close();}
  const format=head.subarray(0,6).equals(Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c]))?'7z':head.readUInt32LE(0)===0x04034b50?'zip':null;
  if(!format)throw new Error('COMFY_ARCHIVE_FORMAT');const exe=await executor(options.executorPath);const sha256=await hashComfyFile(archivePath,options.signal);
  const chunks:Buffer[]=[];let length=0;const limits={...COMFY_ARCHIVE_LIMITS,...options.limits};
  await tool(exe,['l','-slt','-sccUTF-8','-p','--',archivePath],options,async stream=>{for await(const raw of stream){const b=Buffer.from(raw);length+=b.length;if(length>limits.maxListingBytes)throw new Error('COMFY_ARCHIVE_LISTING_LIMIT');chunks.push(b);}});
  const listing=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),header=listing.split(/\r?\n----------\r?\n/)[0];
  if(!new RegExp(`(?:^|\\r?\\n)Type = ${format}(?:\\r?\\n|$)`).test(header)||Number(header.match(/(?:^|\n)Physical Size = (\d+)/)?.[1])!==stat.size||/(?:^|\n)(?:Volumes|Multivolume|Volume Index|Errors?|Warnings?|Tail Size|Embedded Stub Size) = /i.test(header))throw new Error('COMFY_ARCHIVE_MULTI_VOLUME_OR_AMBIGUOUS');
  const entries=parseSevenZipListing(listing,options.limits),totalBytes=entries.reduce((n,e)=>n+e.size,0);
  if(totalBytes/Math.max(stat.size,1)>limits.maxRatio)throw new Error('COMFY_ARCHIVE_RATIO_LIMIT');
  return {archivePath,bytes:stat.size,sha256,format,entries,totalBytes,executorPath:exe,warnings:['COMFY_ARCHIVE_CLI_SAFE_ALIASES_NOT_RAW_NAMES','COMFY_ARCHIVE_LOCAL_HASH_NOT_PUBLISHER_AUTHENTICATION']};
}
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export async function extractComfyArchive(manifest:ComfyArchiveManifest,stage:string,options:ComfyArchiveOptions={}):Promise<void>{
  const entries=validateArchiveEntries(manifest.entries,options.limits);const exe=await executor(options.executorPath||manifest.executorPath);
  await assertNoComfyPathLinks(stage);const root=await fs.realpath(stage);
  if((await hashComfyFile(manifest.archivePath,options.signal))!==manifest.sha256)throw new Error('COMFY_ARCHIVE_CHANGED');
  // A single decoder pass avoids re-decoding each solid block for every member of a large environment.
  // Both list and extract iterate the archive's item order. Every segment is independently size+CRC
  // checked; a format/order mismatch fails closed before promotion instead of silently swapping files.
  const files=entries.filter(e=>!e.directory);let done=0,index=0,bytes=0,crc=0xffffffff;
  let handle:Awaited<ReturnType<typeof fs.open>>|undefined;
  for(const entry of entries){throwIfComfyAborted(options.signal);const dest=path.join(root,...entry.name.split('/'));if(!locationContains(root,dest)||dest.length>COMFY_ARCHIVE_LIMITS.maxPathChars)throw new Error('COMFY_ARCHIVE_PATH_LENGTH');await assertNoComfyPathLinks(path.dirname(dest));await fs.mkdir(entry.directory?dest:path.dirname(dest),{recursive:true});await assertNoComfyPathLinks(dest);}
  async function openCurrent():Promise<void>{throwIfComfyAborted(options.signal);if(index>=files.length)return;if(!handle){const dest=path.join(root,...files[index].name.split('/'));await assertNoComfyPathLinks(dest);handle=await fs.open(dest,'wx',0o600);bytes=0;crc=0xffffffff;}}
  async function closeCurrent():Promise<void>{const entry=files[index];if(!entry||bytes!==entry.size||((crc^0xffffffff)>>>0).toString(16).padStart(8,'0').toUpperCase()!==entry.crc.toUpperCase())throw new Error('COMFY_ARCHIVE_INTEGRITY');await handle?.close();handle=undefined;index++;options.onProgress?.(done,manifest.totalBytes);}
  async function emptyFiles():Promise<void>{while(index<files.length&&files[index].size===0){await openCurrent();await closeCurrent();}}
  const sink=new Writable({write(chunk:Buffer,_encoding,callback){(async()=>{let offset=0;await emptyFiles();while(offset<chunk.length){throwIfComfyAborted(options.signal);if(index>=files.length)throw new Error('COMFY_ARCHIVE_OUTPUT_LIMIT');await openCurrent();const length=Math.min(files[index].size-bytes,chunk.length-offset),part=chunk.subarray(offset,offset+length);for(const b of part)crc=CRC_TABLE[(crc^b)&255]^(crc>>>8);await handle!.writeFile(part);bytes+=length;done+=length;offset+=length;if(bytes===files[index].size){await closeCurrent();await emptyFiles();}}})().then(()=>callback(),error=>callback(error));},final(callback){(async()=>{await emptyFiles();if(index!==files.length||done!==manifest.totalBytes)throw new Error('COMFY_ARCHIVE_INTEGRITY');})().then(()=>callback(),error=>callback(error));}});
  try{await tool(exe,['x','-so','-spd','-y','-p','--',manifest.archivePath],options,async stdout=>{await pipeline(stdout,sink);});}finally{await handle?.close();}
  // Detect replacement between listing and individual decoding. No extracted programs are executed.
  if((await hashComfyFile(manifest.archivePath,options.signal))!==manifest.sha256)throw new Error('COMFY_ARCHIVE_CHANGED');
}
