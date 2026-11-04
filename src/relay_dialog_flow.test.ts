import {it,expect,vi} from 'vitest';
import type {ReactElement} from 'react';
const {dialog}=vi.hoisted(()=>({dialog:vi.fn(async()=>false)}));
vi.mock('./store',()=>({useAppStore:(select:(s:unknown)=>unknown)=>select({settings:{language:'zh-CN'},isGenerating:false})}));
vi.mock('./components/relay-recommendation-dialog',()=>({confirmRelayRecommendation:dialog}));
import {NaiRelayRecommendation} from './components/NaiAccountManager';
it('fixed recommendation handler defers external navigation until confirmation',async()=>{
 const browser=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('window',{naiDesktop:{openExternal:browser}});
 const element=NaiRelayRecommendation({language:'zh-CN'}) as ReactElement<{onClick:()=>Promise<void>}>;
 await element.props.onClick();
 const observation={confirmationRequests:dialog.mock.calls.length,browserLaunchesOnReturn:browser.mock.calls.length};
 console.log('DESKTOP_RELAY_OBS '+JSON.stringify(observation));
 expect(observation).toEqual({confirmationRequests:1,browserLaunchesOnReturn:0});
});
