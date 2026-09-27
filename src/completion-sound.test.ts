import {afterEach,it,expect,vi} from 'vitest';
import {normalizeCompletionSound,playCompletionSound} from './completion-sound';
afterEach(()=>vi.unstubAllGlobals());
it('bounds volume and rejects arbitrary URLs, files and oversized audio',()=>{
 expect(normalizeCompletionSound({enabled:true,volume:4,dataUrl:'file:///private.wav'})).toEqual({enabled:true,volume:1,dataUrl:'',name:''});
 expect(normalizeCompletionSound({volume:NaN}).volume).toBe(.5);
 expect(normalizeCompletionSound({dataUrl:'data:audio/wav;base64,'+'A'.repeat(1500000)}).dataUrl).toBe('');
 expect(normalizeCompletionSound({dataUrl:'data:audio/wav;base64,YWJj',name:'beep.wav'}).name).toBe('beep.wav');
});
it('does not create an audio device when disabled/muted and never breaks generation on device error',async()=>{
 const factory=vi.fn(()=>{throw Error('no audio device');});vi.stubGlobal('AudioContext',factory);
 expect(await playCompletionSound({enabled:false})).toBe(false);expect(await playCompletionSound({enabled:true,volume:0})).toBe(false);expect(factory).not.toHaveBeenCalled();
 expect(await playCompletionSound({enabled:true})).toBe(false);expect(factory).toHaveBeenCalledOnce();
});
