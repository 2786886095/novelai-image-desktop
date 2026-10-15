import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAppStore} from './store';
import {DEFAULT_PARAMS} from './types';

// Real Zustand action / quote / submit chain; renderer IPC only is substituted.
// No provider, user configuration, token store or paid request is accessed.
let desktop:any;
const characters=[
 {id:'character-a',prompt:'girl, red coat',negativePrompt:'red hair',useCoords:true,x:0.25,y:0.4},
 {id:'character-b',prompt:'boy, blue coat',negativePrompt:'blue hair',useCoords:true,x:0.75,y:0.6},
];
const reference={id:'precise-a',previewUrl:'data:fixture-only',base64:'synthetic-reference-bytes',type:'character&style' as const,strength:0.8,fidelity:0.7};
beforeEach(()=>{
 useAppStore.setState(useAppStore.getInitialState(),true);
 desktop={hasToken:vi.fn().mockResolvedValue({hasToken:true,anlasBalance:100,tierName:'Opus'}),
  quoteAnlas:vi.fn().mockResolvedValue({ok:true,amount:14,source:'estimate',balance:100,details:['precise-reference-fixture-fee']}),
  inpaint:vi.fn().mockResolvedValue({ok:false,items:[],message:'fixture-no-paid-generation'}),
  loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image:{filePath:'fixture-source.png',fileUrl:'',width:512,height:512}})};
 vi.stubGlobal('window',{naiDesktop:desktop});
 useAppStore.setState({account:{hasToken:true,anlasBalance:100,tierName:'Opus'},
  settings:{language:'zh-CN',modelMode:'anime'} as any,
  params:{...DEFAULT_PARAMS,model:'nai-diffusion-5-full',positivePrompt:'main prompt is independent'},
  workbenchImage:{filePath:'fixture-source.png',fileUrl:'',width:512,height:512},inpaintMask:'fixture-mask',
  inpaintModel:'nai-diffusion-4-5-full-inpainting',inpaintPositivePrompt:'repair two characters',
  inpaintSizeMode:'original',inpaintCustomSize:{width:512,height:512},
  charCaptions:structuredClone(characters),preciseReferences:[structuredClone(reference)],vibeImages:[]});
});
afterEach(()=>{vi.unstubAllGlobals();useAppStore.setState(useAppStore.getInitialState(),true);});

it.each(['full','focused'] as const)('%s inpaint quotes and submits the same two characters and precise reference without clearing fee inputs',async mode=>{
 if(mode==='focused')useAppStore.setState({inpaintRegion:{x:128,y:128,width:256,height:256}});
 const before=structuredClone(useAppStore.getState().preciseReferences);
 await useAppStore.getState().inpaint();
 expect(desktop.quoteAnlas).toHaveBeenCalledOnce();expect(desktop.inpaint).toHaveBeenCalledOnce();
 const quote=desktop.quoteAnlas.mock.calls[0][0],submitted=desktop.inpaint.mock.calls[0];
 expect(quote.feature).toBe('inpaint');
 expect(quote.extras?.charCaptions).toEqual(characters.map(({id,...caption})=>caption));
 expect(quote.extras?.preciseReferences).toEqual([expect.objectContaining({base64:reference.base64,type:reference.type,strength:0.8,fidelity:0.7})]);
 expect(submitted[6]).toEqual(quote.extras);
 expect(submitted[1]).toBe('nai-diffusion-4-5-full-inpainting');
 expect(submitted[5]).toEqual(mode==='focused'?{x:128,y:128,width:256,height:256}:undefined);
 expect(useAppStore.getState().preciseReferences).toEqual(before);
 expect(useAppStore.getState().charCaptions).toEqual(characters);
});
