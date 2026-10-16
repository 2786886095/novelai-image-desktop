// Explicit, bounded framing. Never repairs old truncated JSON or fills fields.
import crypto from 'node:crypto';
export function createNativeCheckChunks({testEntry}){
 let active=null;const errors=[];
 const fields=['v','pid','entry','id','index','count','bytes','sha256','data'];
 const fail=reason=>{errors.push(reason);active=null;return {handled:true,error:reason};};
 return {
  get active(){return active!==null;},
  consume(text,{begin,expectedId}){
   const marker='NATIVE_PROOF_CHUNK:',at=text.indexOf(marker);
   if(at<0)return {handled:false};
   if(text.indexOf(marker,at+marker.length)>=0||text.includes('FEATURE_ACCEPTANCE_'))return fail('Merged chunk/proof markers forbidden');
   let p;try{p=JSON.parse(text.slice(at+marker.length).trim());}catch{return fail('Malformed explicit native chunk');}
   if(!p||Array.isArray(p)||Object.keys(p).length!==fields.length||Object.keys(p).some(k=>!fields.includes(k))||p.v!==1||!begin||!Number.isSafeInteger(begin.nativePid)||begin.nativePid<1||p.pid!==begin.nativePid||p.entry!==testEntry||p.id!==expectedId||!Number.isSafeInteger(p.index)||!Number.isSafeInteger(p.count)||p.count<2||p.count>86||p.index<0||p.index>=p.count||!Number.isSafeInteger(p.bytes)||p.bytes<701||p.bytes>32768||p.count!==Math.ceil(p.bytes/384)||!/^[a-f0-9]{64}$/.test(p.sha256||'')||typeof p.data!=='string'||p.data.length>512||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.data))return fail('Explicit chunk identity/size/shape mismatch');
   const bytes=Buffer.from(p.data,'base64');
   if(bytes.toString('base64')!==p.data||bytes.length!==Math.min(384,p.bytes-p.index*384))return fail('Explicit chunk bytes are not canonical or fixed-length');
   if(!active){if(p.index!==0)return fail('Explicit chunk sequence must start at zero');active={...p,parts:[]};}
   if(['v','pid','entry','id','count','bytes','sha256'].some(k=>p[k]!==active[k])||p.index!==active.parts.length)return fail('Explicit chunk replay/order/header mismatch');
   active.parts.push(bytes);
   if(p.index!==p.count-1)return {handled:true};
   const whole=Buffer.concat(active.parts);active=null;
   if(whole.length!==p.bytes||crypto.createHash('sha256').update(whole).digest('hex')!==p.sha256)return fail('Explicit chunk length/SHA mismatch');
   let literal;try{literal=new TextDecoder('utf-8',{fatal:true}).decode(whole);}catch{return fail('Explicit chunk payload is not UTF-8');}
   if(/[\r\n]/.test(literal))return fail('Explicit chunk payload must be one original JSON line');
   // Existing proof parser applies all original source/profile/kind/count rules.
   return {handled:true,literal:'FEATURE_ACCEPTANCE_CHECK:'+literal};
  },
  finishErrors(){return [...errors,...(active?['Incomplete explicit native chunk sequence']:[])];}
 };
}
