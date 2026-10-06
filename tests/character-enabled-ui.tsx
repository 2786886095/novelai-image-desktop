import React from 'react';
import {createRoot} from 'react-dom/client';
import {CharCaptionsModal} from '../src/App';
import {useAppStore} from '../src/store';
import {DEFAULT_PARAMS} from '../src/types';
import '../src/styles.css';

let settings:any=JSON.parse(localStorage.getItem('character-switch-test-settings')||'null')??{language:'zh-CN',autoComplete:false,persistGenerateParams:true,positivePromptPresets:[]};
const api:any={getSettings:async()=>settings,setSetting:async(k:string,v:any)=>{settings={...settings,[k]:structuredClone(v)};localStorage.setItem('character-switch-test-settings',JSON.stringify(settings));return settings;},
 onGenerationPreview:()=>()=>{},onUpdateEvent:()=>()=>{},accountCached:async()=>({hasToken:false}),isFirstRun:async()=>false,getHistoryDates:async()=>[],getHistoryGroups:async()=>[],isPortable:async()=>false,getHistory:async()=>[]};
window.naiDesktop=api;
await useAppStore.getState().load();
if(!settings.lastGenerationState)useAppStore.getState().setCharCaptions([{id:'alice',prompt:'blue coat',negativePrompt:'red coat',useCoords:true,x:.2,y:.3},{id:'bob',prompt:'green coat',negativePrompt:'hat',useCoords:true,x:.8,y:.7}]);
useAppStore.setState({params:{...DEFAULT_PARAMS,model:'nai-diffusion-5-full'}});
(window as any).qa={store:useAppStore};
createRoot(document.getElementById('root')!).render(<CharCaptionsModal onClose={()=>{}}/>);
