import {afterEach,expect,it,vi} from 'vitest';
import {useAppStore} from './store';
import {calculateFeatureAnlasQuote,calculateImageGenerationAnlas} from './anlas';
import {DEFAULT_PARAMS,type AccountSummary,type GenerateExtras} from './types';

const paid:AccountSummary={hasToken:true,anlasBalance:10000,tierName:'Tablet',tierLevel:1,hasActiveSubscription:true};
const opus:AccountSummary={...paid,tierName:'Opus',tierLevel:3};
const precise=(count:number)=>Array.from({length:count},(_,i)=>({base64:'synthetic-precise-'+i,type:'character' as const,strength:1,fidelity:1}));
const vibes=Array.from({length:2},(_,i)=>({base64:'synthetic-vibe-'+i,infoExtracted:1,strength:1}));
const captions=[{id:'A',enabled:true,prompt:'original character',negativePrompt:'original undesired',useCoords:true,x:.2,y:.4}];
const source={filePath:'synthetic-source.png',fileUrl:'',width:512,height:512};
const failure={ok:false,items:[],statusCode:400,message:'synthetic only; no provider called'};

function setup(){
 useAppStore.setState(useAppStore.getInitialState(),true);
 const desktop:any={hasToken:vi.fn().mockResolvedValue(paid),setSetting:vi.fn().mockResolvedValue({ok:true}),
  quoteAnlas:vi.fn().mockResolvedValue({ok:true,amount:12,balance:10000,source:'estimate'}),
  generate:vi.fn().mockResolvedValue(failure),generateI2I:vi.fn().mockResolvedValue(failure),inpaint:vi.fn().mockResolvedValue(failure),
  loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image:source}),getHistoryDates:vi.fn().mockResolvedValue([]),getHistoryGroups:vi.fn().mockResolvedValue([]),getHistory:vi.fn().mockResolvedValue([])};
 vi.stubGlobal('window',{naiDesktop:desktop});
 useAppStore.setState({account:paid,settings:{language:'zh-CN',modelMode:'anime'} as any,
  params:{...DEFAULT_PARAMS,model:'nai-diffusion-4-5-full',positivePrompt:'synthetic prompt',seedMode:'fixed',seed:77},
  workbenchImage:source,i2iOriginalImage:source,i2iSourceMode:'original',i2iSizeMode:'custom',batchCount:1,batchIntervalSeconds:0,
  inpaintModel:'nai-diffusion-4-5-full-inpainting',inpaintPositivePrompt:'synthetic repair',inpaintMask:'synthetic-mask',inpaintSizeMode:'original',
  charCaptions:structuredClone(captions),preciseReferences:precise(1).map((r,i)=>({...r,id:'ref-'+i,previewUrl:''})),vibeImages:vibes.map((v,i)=>({...v,id:'vibe-'+i,previewUrl:''}))});
 return desktop;
}
afterEach(()=>{vi.unstubAllGlobals();useAppStore.setState(useAppStore.getInitialState(),true);});

it('adds up to the actual V4.5 inpaint limit when the unrelated main model is V3',()=>{
 setup();useAppStore.setState(s=>({activeTab:'inpaint',params:{...s.params,model:'nai-diffusion-3'},charCaptions:[]}));
 for(let i=0;i<7;i++)useAppStore.getState().addCharCaption();
 expect(useAppStore.getState().charCaptions).toHaveLength(6);
});
it('does not apply a V4.5 main-model limit to a V5 inpaint operation',()=>{
 setup();useAppStore.setState({activeTab:'inpaint',inpaintModel:'nai-diffusion-5-full-inpainting',charCaptions:[]});
 for(let i=0;i<7;i++)useAppStore.getState().addCharCaption();
 expect(useAppStore.getState().charCaptions).toHaveLength(7);
});
it('keeps saved characters intact when an unsupported active main model prevents adding',()=>{
 setup();const saved=structuredClone(useAppStore.getState().charCaptions);
 useAppStore.setState(s=>({activeTab:'generate',params:{...s.params,model:'nai-diffusion-3'}}));
 useAppStore.getState().addCharCaption();expect(useAppStore.getState().charCaptions).toEqual(saved);
});

it.each([1,2,3].flatMap(refCount=>[1,3].map(batchCount=>({refCount,batchCount}))))('prices $refCount precise references across $batchCount outputs per reference and output',({refCount,batchCount})=>{
 const q=calculateImageGenerationAnlas({params:{...DEFAULT_PARAMS,model:'nai-diffusion-4-5-full'},account:opus,batchCount,
  extras:{charCaptions:[],vibeImages:[],preciseReferences:precise(refCount)}});
 expect(q.amount).toBe(5*refCount*batchCount);
});

it.each([0,1,2])('quotes all I2I outputs and charges two vibes only once with %i already encoded',alreadyEncodedVibes=>{
 const params={...DEFAULT_PARAMS,model:'nai-diffusion-4-5-full' as const};
 const base=calculateImageGenerationAnlas({params,account:paid,action:'img2img',strength:.7}).amount!;
 const extras:GenerateExtras={charCaptions:[],vibeImages:vibes,preciseReferences:precise(2)};
 const q=calculateFeatureAnlasQuote({feature:'i2i',params,account:paid,extras,batchCount:3,i2iParams:{strength:.7,noise:0,extraNoiseSeed:0},alreadyEncodedVibes});
 expect(q.amount).toBe((base+5*2)*3+2*(2-alreadyEncodedVibes));
});

it('quotes the three actual I2I submissions together without multiplying one-time vibe encoding',async()=>{
 const desktop=setup();useAppStore.setState({batchCount:3});const quotes:any[]=[];
 desktop.quoteAnlas.mockImplementation(async(request:any)=>{const result=calculateFeatureAnlasQuote(request);quotes.push({request,result});return result;});
 let seq=0;desktop.generateI2I.mockImplementation(async(params:any)=>({ok:true,message:'synthetic result',actualSeed:++seq,items:[{id:'synthetic-'+seq,date:'2000-01-01',createdAt:'2000-01-01T00:00:00Z',filePath:'synthetic-'+seq+'.png',fileUrl:'',actualSeed:seq,params,model:params.model,width:params.width,height:params.height}]}));
 await useAppStore.getState().generateI2I();expect(desktop.generateI2I).toHaveBeenCalledTimes(3);expect(quotes).toHaveLength(1);
 const {request,result}=quotes[0];expect(request.batchCount).toBe(3);
 const perOutput=calculateImageGenerationAnlas({params:request.params,account:paid,action:'img2img',strength:request.i2iParams.strength,
  extras:{...request.extras,vibeImages:[]}}).amount!;
 expect(result.amount).toBe(perOutput*3+vibes.length*2);
 for(const call of desktop.generateI2I.mock.calls)expect(call[2]).toBe(request.extras);
});

it.each(['generate','generateI2I','inpaint'] as const)('%s retains the same quoted conditioning snapshot after UI changes',async method=>{
 const desktop=setup();desktop.quoteAnlas.mockImplementation(async()=>{
  useAppStore.setState(s=>({params:{...s.params,model:'nai-diffusion-3'},charCaptions:[],preciseReferences:[],vibeImages:[],inpaintModel:'nai-diffusion-5-full-inpainting'}));
  return {ok:true,amount:12,balance:10000,source:'estimate'};
 });
 await useAppStore.getState()[method]();expect(desktop[method]).toHaveBeenCalledOnce();
 const quote=desktop.quoteAnlas.mock.calls[0][0];const call=desktop[method].mock.calls[0];const extras=call[method==='generate'?1:method==='generateI2I'?2:6];
 expect(extras).toBe(quote.extras);expect(extras.charCaptions[0].prompt).toBe(captions[0].prompt);expect(extras.preciseReferences).toHaveLength(1);expect(extras.vibeImages).toHaveLength(2);
 expect(call[0].model).toBe('nai-diffusion-4-5-full');
});

it('keeps a queued operation conditioning snapshot identical to its quote',async()=>{
 const desktop=setup();useAppStore.setState({isGenerating:true,isGenerateQueueRunning:true,activeGenerationRunId:'synthetic-run',queueVersion:1,generationQueue:[]});
 desktop.quoteAnlas.mockImplementation(async()=>{useAppStore.setState({charCaptions:[],preciseReferences:[],vibeImages:[]});return {ok:true,amount:12,balance:10000,source:'estimate'};});
 await useAppStore.getState().enqueueGeneration();const quote=desktop.quoteAnlas.mock.calls[0][0],job=useAppStore.getState().generationQueue[0];
 expect(job.params).toBe(quote.params);expect(job.extras).toBe(quote.extras);expect(job.extras.charCaptions).toHaveLength(1);expect(job.extras.preciseReferences).toHaveLength(1);
});
