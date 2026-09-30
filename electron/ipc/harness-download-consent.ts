import crypto from 'node:crypto';
import type {HarnessDownload} from './harness-update';
/** Short lived, one-use, bound to the exact size/hash shown before downloading. */
export class HarnessDownloadConsent<T extends {version:string;bytes:number}=HarnessDownload> {
 private pending:{token:string;expires:number;kind:'component'|'official';reinstall:boolean;asset:T}|null=null;
 issue(asset:T,kind:'component'|'official',reinstall:boolean){
  const token=crypto.randomBytes(24).toString('hex');this.pending={token,expires:Date.now()+600000,asset,kind,reinstall};
  return {token,version:asset.version,bytes:asset.bytes};
 }
 consume(token:unknown,kind:unknown){const p=this.pending;this.pending=null;
  if(!p||token!==p.token||kind!==p.kind||p.expires<Date.now())throw Error('下载确认已失效，请重新确认。');return p;
 }
 clear(){this.pending=null;}
}
