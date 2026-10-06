import React from 'react';
import {createRoot} from 'react-dom/client';
import {ImageCanvas} from '../src/App';
import {LocalFavorites,FavoritesNoticeSupport} from '../src/components/LocalFavorites';
import {ImagePasteSupport} from '../src/image-paste';
import {useAppStore} from '../src/store';
import {DEFAULT_PARAMS} from '../src/types';
import '../src/styles.css';import '../src/favorites.css';
const image=(id:string,color:string)=>({id,filePath:id+'.png',fileUrl:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1408" height="704"><rect width="1408" height="704" fill="${color}"/></svg>`),width:1408,height:704,params:{...DEFAULT_PARAMS,seed:42},seed:42,model:DEFAULT_PARAMS.model,savedAt:new Date().toISOString()});
const history=[image('a','#7656c6'),image('b','#467c77'),image('c','#996444')];
const imported={positivePrompt:'embedded detailed prompt',negativePrompt:'original negative',seed:718,steps:28,cfgScale:6,sampler:'k_euler_ancestral',width:1408,height:704,model:'nai-diffusion-5-full'};
let loadParameters:(path:string)=>void=()=>{};
const api:any={
 setSetting:async(key:string,value:any)=>({...useAppStore.getState().settings,[key]:value}),
 favoritesStatus:async()=>null,favoritesList:async()=>({directory:'fixture',items:[{...history[0],prefix:'20261006',name:'fixture',extension:'.png'}]}),
 onFavoritesChanged:()=>()=>{},onImageParametersRequested:(cb:any)=>{loadParameters=cb;return()=>{};},
 loadImageFromPath:async(path:string)=>({ok:true,image:history.find(h=>h.filePath===path)??{...history[0],filePath:path},metadata:{imported,characterCaptions:[]}}),
 savePastedImageFiles:async()=>['pasted.png'],readClipboardImageFiles:async()=>[{name:'pasted.png',bytes:new Uint8Array([1,2,3])}],
 getPathForFile:(file:any)=>file.path??'',startImageDrag:async()=>{},
};
window.naiDesktop=api;useAppStore.setState({settings:{language:'zh-CN',superDrop:true} as any,activeTab:'generate',history:history as any,currentImage:history[0] as any});
(window as any).qa={store:useAppStore,history,imported,loadParameters:(path:string)=>loadParameters(path),reset:()=>useAppStore.setState({params:{...DEFAULT_PARAMS,positivePrompt:'keep my prompt',seed:123},workbenchImage:null,inputPreviewAnchor:null}),drop:()=>{const transfer=new DataTransfer();const file=new File(['fixture'],'pasted.png',{type:'image/png'});Object.defineProperty(file,'path',{value:'pasted.png'});transfer.items.add(file);document.querySelector('.canvas-area')!.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));}};
createRoot(document.getElementById('root')!).render(<><ImagePasteSupport/><FavoritesNoticeSupport/><div className="persistent-canvas-surface is-active" style={{width:700,height:600,display:'flex'}}><ImageCanvas/></div><LocalFavorites/></>);
