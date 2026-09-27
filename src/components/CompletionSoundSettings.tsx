import {FilePicker} from './FilePicker';
import {RangeInput} from './RangeInput';
import {useFeatureText} from "../feature-i18n";
import {useState} from 'react';
import {useAppStore} from '../store';
import {normalizeCompletionSound,playCompletionSound,type CompletionSound} from '../completion-sound';
import {Button,Toggle} from './ui';
export function CompletionSoundSettings(){
  const ft=useFeatureText();
  const settings=useAppStore(s=>s.settings);const sound=normalizeCompletionSound(settings?.completionSound);
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const save=async(patch:Partial<CompletionSound>)=>{setBusy(true);try{await window.naiDesktop.setSetting('completionSound',normalizeCompletionSound({...sound,...patch}));await useAppStore.getState().refreshSettings();setMessage('已保存');}catch(e){setMessage(String(e));}finally{setBusy(false);}};
  return <section aria-label={ft("生成完成提示音")} style={{display:'grid',gap:10}}>
    <h3>{ft("生成完成提示音")}</h3>
    <Toggle checked={sound.enabled} onChange={enabled=>{if(!busy)void save({enabled});}} label={ft("启用提示音")} description={ft("生成页单张或整批任务完成且至少保存一张图片时播放一次；全部失败或取消不播放。")} />
    <label className="field"><span>{ft("音量")} {Math.round(sound.volume*100)}%</span><RangeInput aria-label={ft("提示音音量")}  min="0" max="1" step="0.1" disabled={busy} value={sound.volume} onChange={e=>void save({volume:Number(e.target.value)})}/></label>
    <label className="field"><span>{ft("自定义音频（MP3 / WAV / OGG，最多 1 MiB，播放最多 10 秒）")}</span><FilePicker  selectedName={sound.name} accept=".mp3,.wav,.ogg" disabled={busy} onChange={async e=>{
      const file=e.target.files?.[0];e.target.value='';if(!file)return;
      if(file.size>1024*1024 || !/\.(mp3|wav|ogg)$/i.test(file.name)){setMessage('请选择不超过 1 MiB 的 MP3、WAV 或 OGG。');return;}
      try {const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error(ft("读取音频失败")));reader.readAsDataURL(file);});
        const mime=/\.mp3$/i.test(file.name)?'mpeg':/\.ogg$/i.test(file.name)?'ogg':'wav';
        const normalized=dataUrl.replace(/^data:[^;]*;/,`data:audio/${mime};`);
        const check=new AudioContext();try{await check.decodeAudioData(await file.arrayBuffer());}finally{await check.close();}
        await save({dataUrl:normalized,name:file.name});
      }catch{setMessage('音频解码失败，原提示音保持不变。');}
    }}/></label>
    <small>{sound.name || ft("内置双音提示")}</small>
    <div className="row-actions"><Button disabled={busy} onClick={()=>void playCompletionSound(sound,true).then(ok=>setMessage(ok?'已试听':'未播放：请检查音量或音频设备。'))}>{ft("试听")}</Button><Button disabled={busy} onClick={()=>void save({dataUrl:'',name:''})}>{ft("恢复内置提示音")}</Button></div>
    {message && <p role="status">{ft(message)}</p>}
  </section>;
}
