import {beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({state:{}as any,confirm:vi.fn(),api:vi.fn(),refresh:vi.fn(),toast:vi.fn()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:(v:unknown)=>[v,()=>{}],useRef:(v:unknown)=>({current:v})}));
vi.mock('./store',()=>({useAppStore:Object.assign((pick:any)=>pick(h.state),{getState:()=>h.state})}));
vi.mock('./components/confirm',()=>({confirmAction:(...args:unknown[])=>h.confirm(...args)}));
import {ConvertedHistoryRestoreButton} from './components/ConvertedHistoryRestoreButton';
import {WorksThumbnailImage} from './components/WorksLibrary';
import {convertedHistoryText} from './converted-history-text';
const tick=()=>new Promise(r=>setTimeout(r,0));
beforeEach(()=>{
 h.confirm.mockReset().mockResolvedValue(true);h.api.mockReset().mockResolvedValue({restored:1,skipped:0,unavailable:0,backupsRead:1,backupErrors:0,checked:1,limited:false,items:[]});h.refresh.mockReset().mockResolvedValue(undefined);h.toast.mockReset();
 h.state={settings:{language:'zh-CN'},refreshHistory:h.refresh,setToast:h.toast};
 vi.stubGlobal('window',{naiDesktop:{restoreConvertedWebpHistory:h.api}});
});
describe('explicit converted-image recovery control',()=>{
 for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])it(`uses translated confirmation and action (${language})`,async()=>{
  h.state.settings.language=language;const element=ConvertedHistoryRestoreButton({})!;const text=convertedHistoryText(language);
  expect(element.props.children).toBe(text.restore);expect(element.props.title).toBe(text.confirm);element.props.onClick();await tick();expect(h.confirm).toHaveBeenCalledWith(text.confirm,text.restore);expect(h.api).toHaveBeenCalledOnce();
 });
 it('does not expose a control on an older bridge without the capability',()=>{vi.stubGlobal('window',{naiDesktop:{}});expect(ConvertedHistoryRestoreButton({})).toBeNull();});
 it('does not mutate or refresh when confirmation is cancelled',async()=>{h.confirm.mockResolvedValue(false);ConvertedHistoryRestoreButton({})!.props.onClick();await tick();expect(h.api).not.toHaveBeenCalled();expect(h.refresh).not.toHaveBeenCalled();});
 it('deduplicates double clicks and refreshes the owning page after restoration',async()=>{const restored=vi.fn();const button=ConvertedHistoryRestoreButton({onRestored:restored})!;button.props.onClick();button.props.onClick();await tick();expect(h.api).toHaveBeenCalledOnce();expect(h.refresh).toHaveBeenCalledOnce();expect(restored).toHaveBeenCalledOnce();expect(h.toast.mock.calls[0][0]).toContain('1');});
 it('does not claim reconstructed records when no backup was usable',async()=>{h.api.mockResolvedValue({restored:0,skipped:0,unavailable:0,backupsRead:0,backupErrors:0,checked:0,limited:false,items:[]});const restored=vi.fn();ConvertedHistoryRestoreButton({onRestored:restored})!.props.onClick();await tick();expect(restored).not.toHaveBeenCalled();expect(h.toast).toHaveBeenCalledWith(convertedHistoryText('zh-CN').none);});
 it('marks partial recovery and does not leak internal error text',async()=>{h.api.mockResolvedValue({restored:1,backupErrors:1,unavailable:0,limited:false});ConvertedHistoryRestoreButton({})!.props.onClick();await tick();expect(h.toast.mock.calls[0][0]).toContain(convertedHistoryText('zh-CN').partial);h.toast.mockReset();h.api.mockRejectedValue(Error('private-fixture-path'));ConvertedHistoryRestoreButton({})!.props.onClick();await tick();expect(h.toast).toHaveBeenCalledWith(convertedHistoryText('zh-CN').error);});
});
it('clears the old missing-image visibility/class when the recovered WebP loads',()=>{
 const missing=vi.fn(),classes=new Set<string>();const target={style:{visibility:''},parentElement:{classList:{add:(n:string)=>classes.add(n),remove:(n:string)=>classes.delete(n)}}};
 const old=WorksThumbnailImage({src:'fixture.png',onMissing:missing});old.props.onError({currentTarget:target});expect(target.style.visibility).toBe('hidden');expect(classes.has('has-missing-image')).toBe(true);expect(missing).toHaveBeenCalledOnce();
 const recovered=WorksThumbnailImage({src:'fixture.webp',onMissing:missing});expect(recovered.key).not.toBe(old.key);recovered.props.onLoad({currentTarget:target});expect(target.style.visibility).toBe('');expect(classes.has('has-missing-image')).toBe(false);
});
