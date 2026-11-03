import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {relayImportCode,exchangeRelayCode,type RelayImportNotice} from './ipc/relay-account-import';
import type {NaiAccountInput} from '../src/nai-accounts';
import {rememberRelaySecret} from './relay-import-redaction';

/** Only high-entropy code digests reach disk. Mark before network I/O, including failed attempts. */
export function relayCodeJournal(file:string):(digest:string)=>boolean {
  return digest=>{
    let old:string[]=[];
    if(fs.existsSync(file)){const x:unknown=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(x)||x.length>10000||!x.every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)))throw new Error('Import journal unavailable');old=x;}
    if(old.includes(digest))return false;
    if(old.length>=10000)throw new Error('Import journal full');
    fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';
    try{fs.writeFileSync(tmp,JSON.stringify([...old,digest]),{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
    return true;
  };
}

export function createRelayLinkInbox(deps:{markSeen:(hash:string)=>boolean;save:(input:NaiAccountInput)=>Promise<RelayImportNotice>;notify:(notice:RelayImportNotice)=>void;exchange?:(code:string)=>Promise<NaiAccountInput>;now?:()=>number}) {
  const seen=new Set<string>(),pending:Array<{code:string;time:number}>=[];let ready=false,running=false;
  const now=deps.now??Date.now;
  const notify=(status:RelayImportNotice['status'])=>{try{deps.notify({id:randomUUID(),status,selected:false});}catch{/* Never forward untrusted errors to logs. */}};
  async function drain(){
    if(!ready||running)return;running=true;
    try{while(pending.length){const item=pending.shift()!;try{
      if(now()-item.time>90000){notify('failed');continue;}
      if(!deps.markSeen(createHash('sha256').update(item.code).digest('hex'))){notify('failed');continue;}
      const input=await(deps.exchange??exchangeRelayCode)(item.code);
      try{deps.notify(await deps.save(input));}finally{input.token='';}
    }catch(error){notify(error instanceof Error&&error.message==='Relay exchange unavailable'?'unavailable':'failed');}finally{item.code='';}}}
    finally{running=false;}
  }
  return {
    receive(value:unknown){const code=relayImportCode(value);if(!code){notify('invalid-link');return;}
      const digest=createHash('sha256').update(code).digest('hex');if(seen.has(digest))return;
      if(seen.size>=10000||pending.length>=16){notify('failed');return;}rememberRelaySecret(code);seen.add(digest);pending.push({code,time:now()});void drain();},
    ready(){ready=true;void drain();},
    async settled(){while(running)await new Promise(resolve=>setTimeout(resolve,1));},
  };
}

/** Install synchronously before app.ready; all transport errors are consumed by the inbox. */
export function wireRelayLinkEvents(app:Pick<import('electron').App,'on'>,argv:string[],receive:(url:unknown)=>void,focus:()=>void) {
  const consume=(args:string[])=>{for(let i=0;i<args.length;i++){if(typeof args[i]==='string'&&/^langbai-novelai:/i.test(args[i])){const url=args[i];args[i]='[relay-import]';receive(url);}}};
  app.on('open-url',(event:{preventDefault:()=>void},url:unknown)=>{event.preventDefault();receive(url);focus();});
  app.on('second-instance',(_event:unknown,args:string[])=>{consume(args);focus();});
  consume(argv);
}
