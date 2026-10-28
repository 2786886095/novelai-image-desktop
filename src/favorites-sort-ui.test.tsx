import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import type {ImageFavoriteLibrary} from './favorites-types';
import {FAVORITES_VIEW_KEY} from './favorites-view';
import {favoritesText} from './favorites-text';

// Actual component handlers, promises, and preferences in a hook harness.
// Framework/desktop ports are mocked; these assertions are not a GUI trial.
const harness=vi.hoisted(()=>{
 type Slot={value?:unknown;deps?:unknown[];cleanup?:()=>void};
 const slots:Slot[]=[],effects:Array<()=>void>=[];let cursor=0;
 const changed=(a?:unknown[],b?:unknown[])=>!a||!b||a.length!==b.length||a.some((x,i)=>!Object.is(x,b[i]));
 return {
  store:{settings:{language:'zh-CN'},setToast:vi.fn()},list:vi.fn(),rename:vi.fn(),remove:vi.fn(),
  begin(){cursor=0;},
  state(initial:unknown){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,(value:unknown)=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
  ref(initial:unknown){const i=cursor++;return (slots[i]??={value:{current:initial}}).value;},
  memo(factory:()=>unknown,deps?:unknown[]){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:factory(),deps};return slots[i].value;},
  effect(callback:()=>void|(()=>void),deps?:unknown[]){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){const previous=slots[i]?.cleanup;slots[i]={deps};effects.push(()=>{previous?.();const cleanup=callback();slots[i].cleanup=typeof cleanup==='function'?cleanup:undefined;});}},
  flush(){while(effects.length)effects.shift()!();},
  reset(){for(const slot of slots)slot.cleanup?.();slots.length=0;effects.length=0;cursor=0;},
 };
});
vi.mock('react',async original=>({...await original<typeof import('react')>(),
 useState:(x:unknown)=>harness.state(x),useRef:(x:unknown)=>harness.ref(x),
 useMemo:(fn:()=>unknown,deps?:unknown[])=>harness.memo(fn,deps),
 useCallback:(fn:unknown,deps?:unknown[])=>harness.memo(()=>fn,deps),
 useEffect:(fn:()=>void|(()=>void),deps?:unknown[])=>harness.effect(fn,deps),
 useLayoutEffect:(fn:()=>void|(()=>void),deps?:unknown[])=>harness.effect(fn,deps),
}));
vi.mock('./store',()=>({useAppStore:(selector:(state:typeof harness.store)=>unknown)=>selector(harness.store)}));
vi.mock('./apply-image-parameters',()=>({applyImageParameters:vi.fn()}));
vi.mock('./components/ui',()=>({SelectMenuCompat:()=>null}));
vi.mock('./components/ImagePreviewDialog',()=>({ImagePreviewDialog:()=>null}));
import {LocalFavorites} from './components/LocalFavorites';

type Node=ReactElement<Record<string,any>>;
let tree:Node,values:Map<string,string>,storage:{getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
let library:ImageFavoriteLibrary,listeners:Map<string,Set<(event:Event)=>void>>;
function walk(value:unknown):Node[]{if(Array.isArray(value))return value.flatMap(walk);if(!value||typeof value!=='object'||!('props' in value))return [];const node=value as Node;return [node,...walk(node.props.children)];}
function visible(value:unknown):string{if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(visible).join(' ');if(value&&typeof value==='object'&&'props' in value)return visible((value as Node).props.children);return '';}
function render(){harness.begin();tree=LocalFavorites() as Node;harness.flush();return tree;}
async function settle(){for(let i=0;i<12;i++)await Promise.resolve();render();}
function nodes(){return walk(tree);}
function select(label:string){return nodes().find(x=>x.props['aria-label']===label&&x.props.onChange)!;}
function change(label:string,value:string){select(label).props.onChange({target:{value}});render();}
function cards(){return nodes().filter(x=>x.type==='article').map(x=>String(x.key));}
function preview(){return nodes().find(x=>Array.isArray(x.props.images)&&x.props.onIndex)!;}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((ok,bad)=>{resolve=ok;reject=bad;});return {promise,resolve,reject};}
function fixtureLibrary():ImageFavoriteLibrary{
 const items=Array.from({length:18},(_,i)=>({
  id:'f'+String(i).padStart(2,'0'),sha256:String(i),filePath:'fixture/'+i+'.png',fileUrl:i===4?undefined:'fixture://'+i,
  prefix:(i%2?'20261013':'20261014')+'_'+String(i),name:String(i),extension:'.png',width:64,height:64,
  savedAt:'2026-10-14T'+String(i).padStart(2,'0')+':00:00Z',
  generatedAt:i<16?'2026-10-14T'+String(17-i).padStart(2,'0')+':00:00Z':i===16?'invalid':undefined,
  missing:i===3,
 })).reverse();
 return {directory:'fixture',items};
}
beforeEach(async()=>{
 harness.reset();vi.clearAllMocks();harness.store.settings.language='zh-CN';
 values=new Map();storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);}};
 vi.stubGlobal('localStorage',storage);
 listeners=new Map();
 vi.stubGlobal('window',{
  naiDesktop:{favoritesList:harness.list,favoritesRename:harness.rename,favoritesRemove:harness.remove,favoritesChooseDirectory:vi.fn(),openInExplorer:vi.fn().mockResolvedValue(undefined)},
  addEventListener:(type:string,fn:(event:Event)=>void)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type)!.add(fn);},
  removeEventListener:(type:string,fn:(event:Event)=>void)=>listeners.get(type)?.delete(fn),
  dispatchEvent:(event:Event)=>{for(const fn of listeners.get(event.type)??[])fn(event);return true;},
 });
 library=fixtureLibrary();harness.list.mockReset().mockResolvedValue(library);harness.rename.mockResolvedValue(undefined);harness.remove.mockResolvedValue(undefined);
 render();await settle();
});
afterEach(()=>{harness.reset();vi.unstubAllGlobals();});

describe('favorites sorting actual UI handlers (hook harness, not GUI)',()=>{
 it('defaults to saved time descending without requesting generated-time resolution',()=>{
  const text=favoritesText('zh-CN');
  expect(select(text.sortBy).props.value).toBe('savedAt');expect(select(text.sortDirection).props.value).toBe('desc');
  expect(cards()).toEqual(Array.from({length:18},(_,i)=>'f'+String(17-i).padStart(2,'0')));
  expect(harness.list.mock.calls).toEqual([[]]);expect(visible(tree)).toContain(text.sortHelp);
 });
 it('generation mode requests local resolution, sorts unknown last, and persists across remount',async()=>{
  const text=favoritesText('zh-CN');change(text.sortBy,'generatedAt');await settle();
  expect(harness.list.mock.calls).toEqual([[],[{resolveGeneratedAt:true}]]);
  expect(cards()).toEqual(Array.from({length:18},(_,i)=>'f'+String(i).padStart(2,'0')));
  expect(visible(tree)).toContain(text.unknownGeneratedHint.replace('{count}','2'));
  change(text.sortDirection,'asc');await settle();
  expect(cards()).toEqual([...Array.from({length:16},(_,i)=>'f'+String(15-i).padStart(2,'0')),'f16','f17']);
  expect(harness.list).toHaveBeenCalledTimes(2);
  expect(JSON.parse(values.get(FAVORITES_VIEW_KEY)!)).toEqual({pageSize:24,layout:'grid',sortBy:'generatedAt',sortDirection:'asc'});
  harness.reset();render();await settle();
  expect(select(text.sortBy).props.value).toBe('generatedAt');expect(select(text.sortDirection).props.value).toBe('asc');
  expect(harness.list).toHaveBeenLastCalledWith({resolveGeneratedAt:true});
 });
 it('sorts after the unchanged collection-date filter, before pagination; changing order resets page',async()=>{
  const text=favoritesText('zh-CN');change(text.pageSize,'12');await settle();
  nodes().find(x=>x.props['aria-label']==='下一页')!.props.onClick();render();
  expect(cards()).toEqual(['f05','f04','f03','f02','f01','f00']);
  change(text.sortBy,'generatedAt');await settle();
  expect(cards()).toEqual(Array.from({length:12},(_,i)=>'f'+String(i).padStart(2,'0')));
  expect(visible(tree).replace(/\s+/g,' ')).toContain('1 / 2');
  change(text.date,'20261013');await settle();
  expect(cards()).toEqual(['f01','f03','f05','f07','f09','f11','f13','f15','f17']);
  change(text.sortDirection,'asc');await settle();
  expect(cards()).toEqual(['f15','f13','f11','f09','f07','f05','f03','f01','f17']);
  expect(library.items.map(x=>x.id)).toEqual(Array.from({length:18},(_,i)=>'f'+String(17-i).padStart(2,'0')));
 });
 it('preview previous/next follows the full sorted filter rather than only the current page',async()=>{
  const text=favoritesText('zh-CN');change(text.sortBy,'generatedAt');change(text.pageSize,'12');await settle();
  nodes().find(x=>x.props.className==='favorite-image')!.props.onClick({currentTarget:{}});
  render();
  expect(preview().props.images.map((x:{src:string})=>x.src)).toEqual([0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17].map(i=>'fixture://'+i));
  expect(preview().props.index).toBe(0);
  preview().props.onIndex(11);render();expect(preview().props.index).toBe(11);
  change(text.sortDirection,'asc');await settle();
  expect(preview().props.index).toBe(2);
  preview().props.onIndex(1);render();expect(preview().props.images[preview().props.index].src).toBe('fixture://14');
 });
 it('storage write failure leaves current-session sorting effective and shows an honest warning',async()=>{
  const text=favoritesText('zh-CN'),before=JSON.stringify({pageSize:12,layout:'masonry'});values.set(FAVORITES_VIEW_KEY,before);
  storage.setItem=()=>{throw Error('quota fixture');};
  change(text.sortBy,'generatedAt');await settle();change(text.sortDirection,'asc');await settle();
  expect(select(text.sortBy).props.value).toBe('generatedAt');expect(select(text.sortDirection).props.value).toBe('asc');
  expect(cards().slice(0,3)).toEqual(['f15','f14','f13']);
  expect(visible(tree)).toContain(text.viewSaveFailed);
  expect(values.get(FAVORITES_VIEW_KEY)).toBe(before);
 });
 it('localStorage getter failure still permits session choice instead of failing render',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('denied fixture');}});
  try{harness.reset();render();await settle();const text=favoritesText('zh-CN');change(text.sortBy,'generatedAt');await settle();expect(select(text.sortBy).props.value).toBe('generatedAt');expect(visible(tree)).toContain(text.viewSaveFailed);}
  finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');}
 });
 it('an obsolete generation-resolution result cannot overwrite a newer saved-time reload',async()=>{
  const pending=deferred<ImageFavoriteLibrary>(),text=favoritesText('zh-CN');
  harness.list.mockImplementation(options=>options?.resolveGeneratedAt?pending.promise:Promise.resolve(library));
  change(text.sortBy,'generatedAt');await settle();change(text.sortBy,'savedAt');await settle();
  pending.resolve({directory:'obsolete',items:[{...library.items[0],id:'obsolete'}]});await settle();
  expect(cards()).toHaveLength(18);expect(cards()[0]).toBe('f17');expect(visible(tree)).not.toContain('obsolete');
 });
 it('a rejected resolution request shows a failure without claiming timestamp success',async()=>{
  const text=favoritesText('zh-CN');harness.list.mockRejectedValueOnce(Error('hash fixture failed'));
  change(text.sortBy,'generatedAt');await settle();
  expect(nodes().find(x=>x.props.role==='alert')).toBeDefined();expect(visible(tree)).toContain('hash fixture failed');
  expect(select(text.sortBy).props.value).toBe('generatedAt');
 });
});
it('contains sorting and unknown/persistence copy',()=>{
 const text=favoritesText('zh-CN');
 for(const key of ['sortBy','savedAt','generatedAt','sortDirection','newestFirst','oldestFirst','sortHelp','unknownGeneratedHint','unknownGenerated','viewSaveFailed'] as const)expect(text[key].trim()).not.toBe('');
 expect(text.savedAt).not.toBe(text.generatedAt);expect(text.newestFirst).not.toBe(text.oldestFirst);expect(text.unknownGeneratedHint).toContain('{count}');
});

it('masonry streams beyond pageSize without discarding grid pagination preferences',async()=>{
 const text=favoritesText('zh-CN'),base=library.items[0];
 library={directory:'synthetic-130',items:Array.from({length:130},(_,i)=>({...base,id:'stream-'+i,prefix:'20261014_'+i,name:String(i),filePath:'fixture/'+i+'.png',fileUrl:'fixture://'+i,missing:false,savedAt:new Date(Date.UTC(2026,9,14,0,i)).toISOString()}))};
 harness.list.mockResolvedValue(library);window.dispatchEvent(new Event('studio:favorites-changed'));await settle();
 change(text.pageSize,'12');change(text.layout,'masonry');await settle();
 expect(cards()).toHaveLength(48);expect(cards().slice(0,3)).toEqual(['stream-129','stream-128','stream-127']);
 expect(select(text.pageSize)).toBeUndefined();expect(nodes().some(x=>x.props.className==='favorites-pagination')).toBe(false);
 expect(visible(tree)).toContain(text.loadedCount.replace('{shown}','48').replace('{total}','130'));
 expect(JSON.parse(values.get(FAVORITES_VIEW_KEY)!)).toEqual({pageSize:12,layout:'masonry',sortBy:'savedAt',sortDirection:'desc'});
 change(text.sortDirection,'asc');await settle();expect(cards().slice(0,3)).toEqual(['stream-0','stream-1','stream-2']);
 change(text.layout,'grid');await settle();expect(select(text.pageSize).props.value).toBe(12);expect(cards()).toHaveLength(12);
 nodes().find(x=>x.props['aria-label']==='下一页')!.props.onClick();render();expect(cards()[0]).toBe('stream-12');
});
it('has continuous browsing copy',()=>{
 const text=favoritesText('zh-CN');for(const key of ['continuousHelp','loadedCount','allLoaded'] as const)expect(text[key].trim()).not.toBe('');
 expect(text.loadedCount).toContain('{shown}');expect(text.loadedCount).toContain('{total}');expect(text.allLoaded).toContain('{total}');
});
