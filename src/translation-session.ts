import {normalizeTranslationSource} from './translation';

export interface TranslationReply {ok:boolean;text?:string;error?:string;sourceLanguage?:string}
export interface TranslationDraftState {
 source:string;result:string;sourceLanguage:string;target:string;detectedSource:string;
 busy:boolean;composing:boolean;live:boolean;valid:boolean;error:string;
}
export type TranslationRunner=(source:string,target:string,sourceLanguage:string)=>Promise<TranslationReply>;

/** Local draft; one request in flight, latest intent wins, no parent prompt writes. */
export class TranslationSession {
 private value:TranslationDraftState;
 private listeners=new Set<()=>void>();
 private timer:ReturnType<typeof setTimeout>|undefined;
 private revision=0;
 private queued=false;
 private disposed=false;
 constructor(source:string,target:string,private runner:TranslationRunner,live=false,sourceLanguage='auto',private delay=600){
  this.value={source,result:'',sourceLanguage:normalizeTranslationSource(sourceLanguage),target,detectedSource:'',busy:false,composing:false,live,valid:false,error:''};
 }
 get snapshot(){return this.value;}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private patch(next:Partial<TranslationDraftState>){if(this.disposed)return;this.value={...this.value,...next};this.listeners.forEach(f=>f());}
 private cancelTimer(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;this.queued=false;}
 private invalidate(){this.revision++;this.cancelTimer();this.patch({valid:false,error:'',detectedSource:''});}
 private schedule(){
  if(!this.value.live||this.value.composing||!this.value.source.trim()||this.disposed)return;
  this.timer=setTimeout(()=>{this.timer=undefined;this.queued=true;void this.drain();},this.delay);
 }
 start(){this.disposed=false;this.schedule();}
 editSource(source:string){this.invalidate();this.patch({source,...(!source.trim()?{result:''}:{})});this.schedule();}
 editResult(result:string){this.revision++;this.cancelTimer();this.patch({result,valid:!!result.trim(),error:''});}
 setLanguages(sourceLanguage:string,target:string){
  sourceLanguage=normalizeTranslationSource(sourceLanguage);
  if(sourceLanguage===this.value.sourceLanguage&&target===this.value.target)return;
  this.invalidate();this.patch({sourceLanguage,target});this.schedule();
 }
 setLive(live:boolean){if(live===this.value.live)return;this.cancelTimer();this.patch({live});if(live)this.schedule();}
 /** Preview and Settings persist the same live preference; failed saves restore the local switch. */
 async persistLive(live:boolean,persist:(value:boolean)=>Promise<void>){
  const previous=this.value.live;this.setLive(live);
  try{await persist(live);}catch(error){if(!this.disposed)this.setLive(previous);throw error;}
 }
 setComposing(composing:boolean,scheduleOnEnd=true){
  if(composing===this.value.composing)return;
  this.cancelTimer();if(composing)this.revision++;this.patch({composing});if(!composing&&scheduleOnEnd)this.schedule();
 }
 get swapSource(){return this.value.sourceLanguage==='auto'?this.value.detectedSource:this.value.sourceLanguage;}
 get canSwap(){return !!this.swapSource&&!this.value.busy&&!this.value.composing;}
 swap(){
  if(!this.canSwap)return false;
  const old=this.value,sourceLanguage=old.target,target=this.swapSource;
  this.invalidate();
  this.patch({sourceLanguage,target,source:old.valid&&old.result.trim()?old.result:old.source,result:old.valid?old.source:'',valid:old.valid&&!!old.source.trim()});
  if(!this.value.valid)this.schedule();return true;
 }
 translate(){
  if(this.disposed||this.value.composing||!this.value.source.trim())return;
  this.cancelTimer();this.queued=true;void this.drain();
 }
 private async drain(){
  if(this.disposed||this.value.busy||!this.queued||this.value.composing)return;
  this.queued=false;
  const input=this.value,id=this.revision;
  this.patch({busy:true,error:''});
  try{
   const reply=await this.runner(input.source,input.target,input.sourceLanguage);
   if(this.disposed||id!==this.revision)return;
   if(!reply.ok||!reply.text?.trim()){this.patch({valid:false,error:reply.error||'TRANSLATION_FAILED'});return;}
   const detected=normalizeTranslationSource(reply.sourceLanguage);
   this.patch({result:reply.text.trim(),valid:true,detectedSource:detected==='auto'?'':detected});
  }catch(error){if(!this.disposed&&id===this.revision)this.patch({valid:false,error:error instanceof Error?error.message:'TRANSLATION_FAILED'});}
  finally{if(!this.disposed){this.patch({busy:false});if(this.queued)void this.drain();}}
 }
 dispose(){this.disposed=true;this.revision++;this.cancelTimer();this.listeners.clear();}
}
