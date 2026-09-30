import {expect,it} from 'vitest';
import {isPromptApiConfigured,promptSetupText} from './prompt-ui-settings';
import {countTabsThatFit} from './app/tab-overflow';
it('requires a valid HTTP endpoint and a nonempty configured credential',()=>{
 expect(isPromptApiConfigured(undefined)).toBe(false);
 for(const convertApiUrl of ['', 'x','file:///tmp/test','javascript:alert(1)'])expect(isPromptApiConfigured({convertApiUrl,convertApiKey:'test'})).toBe(false);
 expect(isPromptApiConfigured({convertApiUrl:'https://example.test/v1',convertApiKey:' '})).toBe(false);
 expect(isPromptApiConfigured({convertApiUrl:'http://127.0.0.1:8080/v1',convertApiKey:'test'})).toBe(true);
});
it('keeps every tab when everything fits without reserving unnecessary menu space',()=>{expect(countTabsThatFit([80,90,100],282,6,80)).toBe(3);});
it('reserves overflow control space and preserves the fitting prefix',()=>{expect(countTabsThatFit([80,90,100],280,6,80)).toBe(2);expect(countTabsThatFit([80,90],150,6,80)).toBe(0);expect(countTabsThatFit([80],0,6,80)).toBe(0);});
it('never loses identities when splitting or resizing',()=>{const items=[1,2,3,4,5];for(let w=0;w<700;w+=13){const n=countTabsThatFit(items.map(()=>90),w,6,80);expect([...items.slice(0,n),...items.slice(n)]).toEqual(items);}});
it('includes missing API guidance in all five languages',()=>{for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){const t=promptSetupText(language);expect(t.configure).toBeTruthy();expect(t.more).toBeTruthy();}});
