export interface CompletionSound { enabled: boolean; volume: number; dataUrl: string; name: string }
export const DEFAULT_COMPLETION_SOUND: CompletionSound = {enabled:false,volume:0.5,dataUrl:'',name:''};
export function normalizeCompletionSound(value: unknown): CompletionSound {
  const v=(value ?? {}) as Partial<CompletionSound>;
  const data=typeof v.dataUrl==='string' && v.dataUrl.length<=1500000 && /^data:audio\/(?:mpeg|mp3|wav|x-wav|wave|ogg);base64,[a-zA-Z0-9+/=]+$/.test(v.dataUrl) ? v.dataUrl : '';
  return {enabled:v.enabled===true,volume:typeof v.volume==='number' && Number.isFinite(v.volume)?Math.min(1,Math.max(0,v.volume)):0.5,dataUrl:data,name:data && typeof v.name==='string'?v.name.slice(0,160):''};
}
let context: AudioContext | null=null;
let playing: AudioBufferSourceNode | null=null;
export function unlockCompletionSound() {
  try {context ??= new AudioContext();void context.resume().catch(()=>{});} catch { /* No audio device: generation remains available. */ }
}
export async function playCompletionSound(value: unknown, preview=false): Promise<boolean> {
  const sound=normalizeCompletionSound(value);
  if ((!sound.enabled && !preview) || sound.volume===0) return false;
  try {
    context ??= new AudioContext();await context.resume();
    if(context.state!=='running')return false;
    playing?.stop();playing=null;
    const gain=context.createGain();gain.gain.value=sound.volume;gain.connect(context.destination);
    if(sound.dataUrl){
      const bytes=Uint8Array.from(atob(sound.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
      const buffer=await context.decodeAudioData(bytes.buffer);
      const source=context.createBufferSource();source.buffer=buffer;source.connect(gain);playing=source;
      source.onended=()=>{if(playing===source)playing=null;source.disconnect();gain.disconnect();};
      source.start();source.stop(context.currentTime+Math.min(buffer.duration,10));
    } else {
      const oscillator=context.createOscillator();oscillator.type='sine';
      oscillator.frequency.setValueAtTime(660,context.currentTime);oscillator.frequency.setValueAtTime(880,context.currentTime+0.15);
      gain.gain.setValueAtTime(sound.volume*0.2,context.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,context.currentTime+0.45);
      oscillator.connect(gain);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start();oscillator.stop(context.currentTime+0.46);
    }
    return true;
  } catch {return false;}
}
