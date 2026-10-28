import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAppStore} from './store';
import {DEFAULT_PARAMS} from './types';

let desktop:any;
beforeEach(()=>{
 useAppStore.setState(useAppStore.getInitialState(),true);
 desktop={hasToken:vi.fn().mockResolvedValue({hasToken:true,anlasBalance:100,tierName:'Opus'}),
  quoteAnlas:vi.fn().mockResolvedValue({ok:true,amount:14,source:'estimate',balance:100,details:[]}),
  inpaint:vi.fn().mockResolvedValue({ok:false,items:[],message:'fixture-no-paid-generation'}),
  loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image:{filePath:'fixture-only.png',fileUrl:'',width:3840,height:2160}})};
 vi.stubGlobal('window',{naiDesktop:desktop});
 useAppStore.setState({account:{hasToken:true,anlasBalance:100,tierName:'Opus'},settings:{language:'zh-CN'} as any,
  params:{...DEFAULT_PARAMS,positivePrompt:'independent base prompt'},
  workbenchImage:{filePath:'fixture-only.png',fileUrl:'',width:3840,height:2160},inpaintMask:'synthetic-mask',
  inpaintModel:'nai-diffusion-4-5-full-inpainting',inpaintPositivePrompt:'synthetic focused repair',
  inpaintSizeMode:'original',inpaintCustomSize:{width:704,height:1408},
  inpaintRegion:{x:128,y:128,width:256,height:256},
  charCaptions:[],preciseReferences:[],vibeImages:[]});
});
afterEach(()=>{vi.unstubAllGlobals();useAppStore.setState(useAppStore.getInitialState(),true);});

it.each([1152,3840,4096].flatMap(width=>['original','custom'].map(mode=>({width,height:width===1152?1728:2160,mode}))))('quotes the crop and submits the intact $width canvas in $mode mode',async ({width,height,mode})=>{
 useAppStore.setState({workbenchImage:{filePath:'fixture-only.png',fileUrl:'',width,height},inpaintSizeMode:mode as any});
 const paramsBefore={...useAppStore.getState().params};
 await useAppStore.getState().inpaint();
 expect(desktop.quoteAnlas).toHaveBeenCalledOnce();expect(desktop.inpaint).toHaveBeenCalledOnce();
 const q=desktop.quoteAnlas.mock.calls[0][0],args=desktop.inpaint.mock.calls[0];
 expect(q.params).toMatchObject({width:1024,height:1024});expect(q.image).toEqual({width,height});
 expect(args[0]).toMatchObject({width,height,positivePrompt:'synthetic focused repair'});
 expect(args[5]).toEqual({x:128,y:128,width:256,height:256});
 expect(useAppStore.getState().inpaintCustomSize).toEqual({width:704,height:1408});
 expect(useAppStore.getState().params).toEqual(paramsBefore);
});
it('keeps a wide official work crop above 1600 in the quote while retaining original submission dimensions',async()=>{
 useAppStore.setState({inpaintRegion:{x:128,y:128,width:1536,height:384}});
 await useAppStore.getState().inpaint();
 expect(desktop.quoteAnlas.mock.calls[0][0].params).toMatchObject({width:2048,height:512});
 expect(desktop.inpaint.mock.calls[0][0]).toMatchObject({width:3840,height:2160});
});
it('sets a bounded visible NovelAI selection rather than allowing a whole 4K box',()=>{
 useAppStore.getState().setInpaintRegion({x:0,y:0,width:3840,height:2160});
 const r=useAppStore.getState().inpaintRegion!;expect(r.width*r.height).toBeLessThanOrEqual(589824);
 expect(r.x).toBe(0);expect(r.y).toBe(0);
});
it('does not apply NovelAI selection limits to the independent OpenAI editor',()=>{
 useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:'openai'} as any});
 const r={x:0,y:0,width:3840,height:2160};useAppStore.getState().setInpaintRegion(r);
 expect(useAppStore.getState().inpaintRegion).toEqual(r);
});

it('clamps the visible OpenAI ROI when refreshed settings switch to NovelAI before quoting or submitting',async()=>{
 useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:'openai'} as any});
 useAppStore.getState().setInpaintRegion({x:200,y:200,width:1600,height:900});
 const before=useAppStore.getState(),custom=structuredClone(before.inpaintCustomSize),params=structuredClone(before.params),mask=before.inpaintMask;
 desktop.getSettings=vi.fn().mockResolvedValue({language:'zh-CN',inpaintEngine:'novelai'});
 await useAppStore.getState().refreshSettings();
 const visibleBeforeSubmit=structuredClone(useAppStore.getState().inpaintRegion);
 await useAppStore.getState().inpaint();
 const quote=desktop.quoteAnlas.mock.calls[0]?.[0],submit=desktop.inpaint.mock.calls[0];
 process.stdout.write('ENGINE_SWITCH_ROI '+JSON.stringify({visibleBeforeSubmit,visibleAfterSubmit:useAppStore.getState().inpaintRegion,quotedWork:quote?.params&&{width:quote.params.width,height:quote.params.height},submittedRegion:submit?.[5]})+'\n');
 expect(visibleBeforeSubmit).toEqual({x:200,y:200,width:1024,height:576});
 expect(submit?.[5]).toEqual(visibleBeforeSubmit);expect(useAppStore.getState().inpaintRegion).toEqual(visibleBeforeSubmit);
 expect(quote.params).toMatchObject({width:1344,height:768});
 expect(useAppStore.getState().inpaintCustomSize).toEqual(custom);expect(useAppStore.getState().params).toEqual(params);expect(useAppStore.getState().inpaintMask).toBe(mask);
});
it('clears a malformed OpenAI ROI on the switch without failing settings refresh or changing the mask',async()=>{
 useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:'openai'} as any,inpaintRegion:{x:0,y:0,width:7,height:80}});
 desktop.getSettings=vi.fn().mockResolvedValue({language:'zh-CN',inpaintEngine:'novelai'});
 await useAppStore.getState().refreshSettings();
 expect(useAppStore.getState().settings?.inpaintEngine).toBe('novelai');expect(useAppStore.getState().inpaintRegion).toBeNull();expect(useAppStore.getState().inpaintMask).toBe('synthetic-mask');
});
it('clears a stale ROI when switching to NovelAI without a source canvas',async()=>{
 useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:'openai'} as any,workbenchImage:null,i2iOriginalImage:null,inpaintRegion:{x:0,y:0,width:1600,height:900}});
 desktop.getSettings=vi.fn().mockResolvedValue({language:'zh-CN',inpaintEngine:'novelai'});
 await useAppStore.getState().refreshSettings();expect(useAppStore.getState().inpaintRegion).toBeNull();
});
it('does not cap an OpenAI selection during unrelated refreshed settings',async()=>{
 const region={x:200,y:200,width:1600,height:900};useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:'openai',theme:'light'} as any,inpaintRegion:region});
 desktop.getSettings=vi.fn().mockResolvedValue({language:'zh-CN',inpaintEngine:'openai',theme:'dark'});
 await useAppStore.getState().refreshSettings();expect(useAppStore.getState().inpaintRegion).toEqual(region);
});
