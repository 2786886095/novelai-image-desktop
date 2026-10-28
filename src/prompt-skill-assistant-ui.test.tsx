import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
const h=vi.hoisted(()=>({slots:[] as any[],cursor:0,settings:{} as any,writes:vi.fn(),convert:vi.fn()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:(initial:any)=>{const n=h.cursor++;if(!(n in h.slots))h.slots[n]=typeof initial==='function'?initial():initial;return[h.slots[n],(next:any)=>{h.slots[n]=typeof next==='function'?next(h.slots[n]):next;}];},useRef:(initial:any)=>{const n=h.cursor++;return h.slots[n]??={current:initial};},useEffect:()=>{}}));
vi.mock('./store',()=>({useAppStore:Object.assign((selector:any)=>selector({settings:h.settings}),{getState:()=>({settings:h.settings,refreshSettings:async()=>{}})})}));
import {PromptAssistant} from './components/PromptAssistant';
import {PromptSkillControls} from './components/PromptSkillControls';
const walk=(value:any):ReactElement<Record<string,any>>[]=>Array.isArray(value)?value.flatMap(walk):value&&typeof value==='object'&&'props'in value?[value,...walk(value.props.children)]:[];
const render=()=>{h.cursor=0;return walk(PromptAssistant({kind:'optimize',currentValue:'1girl, white hair',context:'fixture-context',mode:'tags',version:'v5',edition:'2.0.0',language:'zh-CN',onApply:()=>true,onClose:vi.fn()}));};
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
beforeEach(()=>{h.slots=[];h.cursor=0;h.writes.mockReset();h.convert.mockReset();h.settings={convertApiUrl:'https://fixture.invalid/v1',convertApiKey:'fixture',convertPromptTemplateVersion:'v4.5',convertPromptSkillVersion:'1.0.0',promptAssistantTemplateVersion:'v5',promptAssistantSkillVersion:'2.0.0'};vi.stubGlobal('window',{naiDesktop:{convertPrompt:h.convert,setSetting:async(key:string,value:unknown)=>{h.writes(key,value);h.settings[key]=value;}}});});
afterEach(()=>vi.unstubAllGlobals());
it('assistant and optimizer have explicit independent model/edition controls',async()=>{
 const control=render().find(n=>n.type===PromptSkillControls)!;expect(control.props).toMatchObject({model:'v5',edition:'2.0.0'});
 control.props.onChange('v4.5','1.0.0');await tick();
 expect(h.writes.mock.calls).toEqual([['promptAssistantTemplateVersion','v4.5'],['promptAssistantSkillVersion','1.0.0']]);
 expect(h.settings.convertPromptTemplateVersion).toBe('v4.5');expect(h.settings.convertPromptSkillVersion).toBe('1.0.0');
});
it('actual optimizer action sends both axes, preserving the old assistant argument position',async()=>{
 h.convert.mockResolvedValue({ok:true,result:'1girl, white hair'});
 const run=render().find(n=>n.type==='button'&&n.props.children==='生成预览')!;
 expect(run).toBeTruthy();run.props.onClick();await tick();
 expect(h.convert).toHaveBeenCalledWith('1girl, white hair','tags',false,'v5',{kind:'optimize',instruction:''},'2.0.0');
});
