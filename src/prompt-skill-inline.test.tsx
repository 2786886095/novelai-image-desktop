import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
const h=vi.hoisted(()=>({slots:[] as any[],cursor:0,state:{} as any,reverse:vi.fn(),snapshot:vi.fn(),writes:vi.fn(),refresh:vi.fn(),apply:vi.fn()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
 useState:(initial:any)=>{const n=h.cursor++;if(!(n in h.slots))h.slots[n]=typeof initial==='function'?initial():initial;return[h.slots[n],(next:any)=>{h.slots[n]=typeof next==='function'?next(h.slots[n]):next;}];},
 useRef:(initial:any)=>{const n=h.cursor++;return h.slots[n]??={current:initial};},useEffect:()=>{},
}));
vi.mock('./store',()=>({useAppStore:Object.assign((selector:any)=>selector(h.state),{getState:()=>h.state})}));
import {InlineReversePromptSkillControls,callSelectedInlineReverse,reversePromptSelection,reversePromptSelectionIdentity} from './components/InlineReversePromptSkillControls';
import {PromptSkillControls} from './components/PromptSkillControls';
import {InpaintPromptSource} from './components/InpaintPromptSource';
import {workflowText} from './workflow-text';
const walk=(value:any):ReactElement<Record<string,any>>[]=>Array.isArray(value)?value.flatMap(walk):value&&typeof value==='object'&&'props'in value?[value,...walk(value.props.children)]:[];
const render=()=>{h.cursor=0;return walk(InpaintPromptSource());};
const text=workflowText('zh-CN');
const button=(label:string)=>render().find(n=>n.type==='button'&&n.props.children===label)!;
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(predicate:()=>boolean){for(let n=0;n<100&&!predicate();n++)await tick();expect(predicate()).toBe(true);}
beforeEach(()=>{
 h.slots=[];h.cursor=0;for(const mock of [h.reverse,h.snapshot,h.writes,h.refresh,h.apply])mock.mockReset();
 h.state={settings:{language:'zh-CN',reversePromptTemplateVersion:'v5',reversePromptSkillVersion:'2.0.0',visionApiUrl:'https://fixture.invalid/v1',visionApiKey:'synthetic-key',visionApiModel:'synthetic-model',reversePromptTemplatesV2:{tags:'',natural:'',mixed:''}},workbenchImage:{filePath:'synthetic-original.png'},inpaintPositivePrompt:'previous prompt',refreshSettings:h.refresh,setInpaintPositivePrompt:(value:string)=>{h.apply(value);h.state.inpaintPositivePrompt=value;}};
 h.snapshot.mockResolvedValue({ok:true,snapshot:{base64:'synthetic-image'}});
 h.reverse.mockResolvedValue({ok:true,prompt:'1girl, visible fixture'});
 vi.stubGlobal('window',{naiDesktop:{reversePrompt:h.reverse,readMetadataSnapshotFromPath:h.snapshot,setSetting:async(key:string,value:unknown)=>{h.writes(key,value);h.state.settings={...h.state.settings,[key]:value};}}});
});
afterEach(()=>vi.unstubAllGlobals());
it.each([['v5','1.0.0'],['v4.5','1.0.0'],['v5','2.0.0']] as const)('inline actual call preserves target %s and edition %s as independent last parameters',async(model,edition)=>{
 Object.assign(h.state.settings,{reversePromptTemplateVersion:model,reversePromptSkillVersion:edition});
 await callSelectedInlineReverse('exact-image','mixed','exact-scope-hint',true);
 expect(h.reverse).toHaveBeenCalledExactlyOnceWith('exact-image','mixed','full','exact-scope-hint',true,model,edition);
});
it('a legacy profile without an edition preserves the old six-argument bridge contract',async()=>{
 delete h.state.settings.reversePromptSkillVersion;await callSelectedInlineReverse('image','tags');
 expect(h.reverse).toHaveBeenCalledExactlyOnceWith('image','tags','full','',false,'v5');
 expect(reversePromptSelection(h.state.settings)).toEqual({model:'v5',edition:undefined});
});
it('inline controls persist the reverse model and edition only, not conversion or generation settings',async()=>{
 h.state.settings.convertPromptTemplateVersion='v5';h.state.settings.convertPromptSkillVersion='2.0.0';
 const tree=walk(InlineReversePromptSkillControls({})),control=tree.find(n=>n.type===PromptSkillControls)!;
 expect(control.props).toMatchObject({model:'v5',edition:'2.0.0',disabled:false});
 control.props.onChange('v4.5','1.0.0');await until(()=>h.refresh.mock.calls.length===1);
 expect(h.writes.mock.calls).toEqual([['reversePromptTemplateVersion','v4.5'],['reversePromptSkillVersion','1.0.0']]);
 expect(h.state.settings.convertPromptTemplateVersion).toBe('v5');expect(h.state.settings.convertPromptSkillVersion).toBe('2.0.0');
});
it.each(['reversePromptSkillVersion','reversePromptTemplateVersion','reversePromptTemplatesV2','reverseSystemPromptPresetId','visionApiModel'] as const)('inline request identity detects changes to %s',field=>{
 const before=reversePromptSelectionIdentity(h.state.settings);
 h.state.settings[field]=field==='reversePromptTemplatesV2'?{tags:'new custom',natural:'',mixed:''}:field==='reversePromptTemplateVersion'?'v4.5':field==='reversePromptSkillVersion'?'1.0.0':'changed';
 expect(reversePromptSelectionIdentity(h.state.settings)).not.toBe(before);
});
it('inpaint reverse reads the original snapshot, uses the selected axes, previews then applies only on explicit click',async()=>{
 button(text.reverse).props.onClick();await until(()=>!!h.slots[2]);
 expect(h.snapshot).toHaveBeenCalledExactlyOnceWith('synthetic-original.png');
 expect(h.reverse).toHaveBeenCalledExactlyOnceWith('synthetic-image','tags','full','',false,'v5','2.0.0');
 expect(h.apply).not.toHaveBeenCalled();expect(button(text.apply).props.disabled).toBe(false);
 button(text.apply).props.onClick();expect(h.apply).toHaveBeenCalledExactlyOnceWith('1girl, visible fixture');
});
it('inpaint controlled failure preserves the old prompt and does not create an applicable preview',async()=>{
 h.reverse.mockResolvedValue({ok:false,message:'信息不足：fixture evidence is insufficient'});
 button(text.reverse).props.onClick();await until(()=>!!h.slots[1]);
 expect(h.state.inpaintPositivePrompt).toBe('previous prompt');expect(h.apply).not.toHaveBeenCalled();
 expect(render().some(n=>n.props.role==='alert')).toBe(true);expect(h.slots[2]).toBeNull();expect(button(text.apply)).toBeUndefined();
});
it('inpaint blocks an old preview after the edition changes, including a stale already-captured Apply handler',async()=>{
 button(text.reverse).props.onClick();await until(()=>!!h.slots[2]);const oldApply=button(text.apply);
 h.state.settings={...h.state.settings,reversePromptSkillVersion:'1.0.0'};
 expect(button(text.apply).props.disabled).toBe(true);oldApply.props.onClick();
 expect(h.apply).not.toHaveBeenCalled();expect(h.state.inpaintPositivePrompt).toBe('previous prompt');expect(render().some(n=>n.props.role==='alert')).toBe(true);
});
it('inpaint discards a pending old-edition result rather than installing a preview under the new selection',async()=>{
 let resolve!:(value:any)=>void;h.reverse.mockReturnValue(new Promise(done=>{resolve=done;}));
 button(text.reverse).props.onClick();await until(()=>h.reverse.mock.calls.length===1);
 h.state.settings={...h.state.settings,reversePromptSkillVersion:'1.0.0'};
 resolve({ok:true,prompt:'outdated response'});await until(()=>!!h.slots[1]);
 expect(h.slots[2]).toBeNull();expect(h.apply).not.toHaveBeenCalled();expect(h.state.inpaintPositivePrompt).toBe('previous prompt');
});
