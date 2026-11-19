import {describe,expect,it} from 'vitest';
import {normalizeV5Output as clean,monoApprovedPage} from './v5-output';
import {parseV5Storyboard} from './v5-storyboard';
import {parseComicPromptPages,comicPromptEnvelope} from './comic-prompt';
import {parsePromptSkillV3Response} from '../prompt-skill';
import {v5Input,v5MonoRequested} from '../../shared/v5-prompt-options';
describe('V5 generated prompt output',()=>{
 const line='comic, left panel: wide shot, single red ribbon, right middle panel: mid shot, text, chinese text, a caption box, Text: "red | 你迟到了。", left lower inset panel: looking down at two hands, right lower panel: close-up of pale blue eyes -1::white border, page margin, frame :: |';
 it('repairs four panel boundaries, preserves quoted literal, moves page negative before text, and is idempotent',()=>{
  const s=clean(line,{mono:true,jp:true});expect(s).toBe('comic, -1::white border, page margin, frame :: | left panel: wide shot, single mid-grey ribbon | right middle panel: mid shot, text, chinese text, a caption box, Text: "red | 你迟到了。" | left lower inset panel: looking down at two hands | right lower panel: close-up of pale grey eyes');expect(clean(s,{jp:true,mono:true})).toBe(s);
 });
 it('keeps supplied segmentation, carrier, dialogue and color in color mode',()=>{
  const s='comic | girl, in the top panel: red coat, a thought bubble, Text: "warm | blue" | girl, in the bottom panel: blue ribbon';expect(clean(s,{jp:true})).toBe(s);
 });
 it('adds a carrier only when missing, not for silent panels; does not manufacture another person slot',()=>{
  expect(clean('table | girl, red ribbon, Text: "久等了。", two cups',{mono:true})).toBe('table | girl, mid-grey ribbon, two cups, text, chinese text, a speech bubble in the upper right clear of the face, Text: "久等了。"');
  expect(clean('1girl, red ribbon',{mono:false})).toBe('1girl, red ribbon');expect(clean('1girl, red ribbon',{mono:true})).not.toContain('bubble');
 });
 it('retains artist names, gray values and English dialogue; distinguishes warm smile from warm light',()=>{
  const s=clean('artist:blue fox, warm smile, warm light, dark brown eyes, pale blue ribbon, solid black, Text: "warm \\"blue\\"" ',{mono:true});expect(s).toContain('artist:blue fox, warm smile, neutral light, dark grey eyes, pale grey ribbon, solid black');expect(s).toContain('Text: "warm \\"blue\\""');expect(s).not.toContain('chinese text');
 });
 it('distinguishes software mono flag from words inside the original request and normalizes both variants',()=>{
  expect(v5MonoRequested(v5Input('red ribbon',{color:'mono'}))).toBe(true);expect(v5MonoRequested(v5Input(v5Input('red',{color:'mono'}),{color:'color'}))).toBe(false);
  const v=parsePromptSkillV3Response(JSON.stringify({namePrompt:'red bow',featurePrompt:'blue eyes'}),true,{mono:true});expect(v.variants).toEqual({namePrompt:'mid-grey bow',featurePrompt:'mid-grey eyes'});
 });
 it('never changes diagnostic raw output or treats a partial page as ready',()=>{const raw='<<<PAGES '+line;expect(parseComicPromptPages(raw,1,true,{jp:true,mono:true})).toMatchObject({raw,countStatus:'truncated'});});
 const page={purpose:'p',layout:'S1',ending:'e',turn:'t',cuts:'',panels:[{position:'full',camera:'close',scene:'roof',actors:'girl',action:'waits',dialogue:[],balloon:[],sfx:null,transition:''}]};
 it('accepts silent or listed balloon fields without relaxing required shot fields or count limits',()=>{
  const raw=(p:unknown)=>JSON.stringify({nodes:'n',pacing:'p',cuts:'',characters:'x',pages:[{...page,panels:[p]}]});const panel=page.panels[0];
  expect(parseV5Storyboard(raw(panel),1,true).pages[0].panels[0].balloon).toBe('');
  expect(parseV5Storyboard(raw({...panel,balloon:['右上','尾朝左']}),1,true).pages[0].panels[0].balloon).toBe('右上；尾朝左');
  for(const bad of [{scene:null},{balloon:[1]},{balloon:['x'.repeat(3001)]},{dialogue:[null]}])expect(()=>parseV5Storyboard(raw({...panel,...bad}),1,true)).toThrow();
 });
 it('omits only color card fields in compiler payload, keeps identities and editable full-color source',()=>{
  const card={name:'Al',color:'red ribbon',bw:'dark ribbon'},c=JSON.stringify(card,null,2);const range={pages:1,batchFrom:1,totalPages:1};
  for(const characters of [[card],{Al:card},c+'\n\n'+c]){const raw=JSON.stringify({characters,page});const mono=monoApprovedPage(raw)!;expect(mono).not.toContain('red ribbon');expect(mono).toContain('dark ribbon');expect(mono).toContain('Al');expect(raw).toContain('red ribbon');const envelope=(color:'color'|'mono')=>comicPromptEnvelope({format:'jp-page',action:'generate',requestId:'offline',input:'s',approvedPage:raw,color},range);expect(envelope('mono')).not.toContain('red ribbon');expect(envelope('color')).toContain('red ribbon');}
 });
});
