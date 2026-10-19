import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {afterEach,expect,it,vi} from 'vitest';
import {FAVORITES_VIEW_KEY,normalizeFavoritesView,loadFavoritesView,saveFavoritesView,favoritePreviewItems,sortFavoriteItems,type FavoritesView} from './favorites-view';
import type {ImageFavorite} from './favorites-types';

type Fixture={description?:string;items:ImageFavorite[];filterDate:string;pageSize:number;expected:Record<string,string[]>};
const fallbackFixture:Fixture={"description":"Synthetic 18-item shuffled service-order fixture; these are not user files or claimed real generation dates","filterDate":"20261014","pageSize":12,"items":[{"id":"f09","sha256":"fixture-f09","filePath":"fixture/f09.png","fileUrl":"file:///fixture/f09.png","prefix":"20261014_f09","name":"fixture f09","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:09:00.000Z","generatedAt":""},{"id":"f02","sha256":"fixture-f02","filePath":"fixture/f02.png","fileUrl":"file:///fixture/f02.png","prefix":"20261014_f02","name":"fixture f02","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:02:00.000Z","generatedAt":"2026-10-10T06:02:00.000Z"},{"id":"f15","sha256":"fixture-f15","filePath":"fixture/f15.png","fileUrl":"file:///fixture/f15.png","prefix":"20261013_f15","name":"fixture f15","extension":".png","width":512,"height":768,"savedAt":"2026-10-13T08:15:00.000Z","generatedAt":"2026-10-09T06:13:00.000Z"},{"id":"f06","sha256":"fixture-f06","filePath":"fixture/f06.png","fileUrl":"file:///fixture/f06.png","prefix":"20261014_f06","name":"fixture f06","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:06:00.000Z","generatedAt":"2026-10-10T06:07:00.000Z"},{"id":"f18","sha256":"fixture-f18","filePath":"fixture/f18.png","fileUrl":"file:///fixture/f18.png","prefix":"20261013_f18","name":"fixture f18","extension":".png","width":512,"height":768,"savedAt":"2026-10-13T08:18:00.000Z","generatedAt":"2026-10-09T06:04:00.000Z"},{"id":"f01","sha256":"fixture-f01","filePath":"fixture/f01.png","fileUrl":"file:///fixture/f01.png","prefix":"20261014_f01","name":"fixture f01","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:01:00.000Z","generatedAt":"2026-10-10T06:09:00.000Z"},{"id":"f12","sha256":"fixture-f12","filePath":"fixture/f12.png","fileUrl":"file:///fixture/f12.png","prefix":"20261014_f12","name":"fixture f12","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:11:00.000Z","generatedAt":"2026-10-10T06:11:00.000Z"},{"id":"f04","sha256":"fixture-f04","filePath":"fixture/f04.png","prefix":"20261014_f04","name":"fixture f04","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:04:00.000Z","generatedAt":"not-a-date"},{"id":"f16","sha256":"fixture-f16","filePath":"fixture/f16.png","fileUrl":"file:///fixture/f16.png","prefix":"20261013_f16","name":"fixture f16","extension":".png","width":512,"height":768,"savedAt":"2026-10-13T08:16:00.000Z","generatedAt":"2026-10-09T06:03:00.000Z"},{"id":"f05","sha256":"fixture-f05","filePath":"fixture/f05.png","fileUrl":"file:///fixture/f05.png","prefix":"20261014_f05","name":"fixture f05","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:05:00.000Z","generatedAt":"2026-10-10T06:07:00.000Z"},{"id":"f10","sha256":"fixture-f10","filePath":"fixture/f10.png","fileUrl":"file:///fixture/f10.png","prefix":"20261014_f10","name":"fixture f10","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:10:00.000Z","generatedAt":"2026-10-10T06:14:00.000Z","missing":true},{"id":"f03","sha256":"fixture-f03","filePath":"fixture/f03.png","fileUrl":"file:///fixture/f03.png","prefix":"20261014_f03","name":"fixture f03","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:03:00.000Z"},{"id":"f14","sha256":"fixture-f14","filePath":"fixture/f14.png","fileUrl":"file:///fixture/f14.png","prefix":"20261014_f14","name":"fixture f14","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:14:00.000Z","generatedAt":"2026-10-10T06:12:00.000Z"},{"id":"f07","sha256":"fixture-f07","filePath":"fixture/f07.png","fileUrl":"file:///fixture/f07.png","prefix":"20261014_f07","name":"fixture f07","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:07:00.000Z","generatedAt":"2026-10-10T06:01:00.000Z"},{"id":"f17","sha256":"fixture-f17","filePath":"fixture/f17.png","fileUrl":"file:///fixture/f17.png","prefix":"20261013_f17","name":"fixture f17","extension":".png","width":512,"height":768,"savedAt":"2026-10-13T08:17:00.000Z","generatedAt":"2026-10-09T06:10:00.000Z"},{"id":"f08","sha256":"fixture-f08","filePath":"fixture/f08.png","fileUrl":"file:///fixture/f08.png","prefix":"20261014_f08","name":"fixture f08","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:08:00.000Z","generatedAt":"2026-10-10T06:15:00.000Z"},{"id":"f13","sha256":"fixture-f13","filePath":"fixture/f13.png","fileUrl":"file:///fixture/f13.png","prefix":"20261014_f13","name":"fixture f13","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:13:00.000Z","generatedAt":"2026-10-10T06:05:00.000Z"},{"id":"f11","sha256":"fixture-f11","filePath":"fixture/f11.png","fileUrl":"file:///fixture/f11.png","prefix":"20261014_f11","name":"fixture f11","extension":".png","width":512,"height":768,"savedAt":"2026-10-14T08:11:00.000Z","generatedAt":"2026-10-10T06:06:00.000Z"}],"expected":{"savedAtDesc":["f14","f13","f11","f12","f10","f09","f08","f07","f06","f05","f04","f03","f02","f01","f18","f17","f16","f15"],"savedAtAsc":["f15","f16","f17","f18","f01","f02","f03","f04","f05","f06","f07","f08","f09","f10","f11","f12","f13","f14"],"generatedAtDesc":["f08","f10","f14","f12","f01","f05","f06","f11","f13","f02","f07","f15","f17","f18","f16","f03","f04","f09"],"generatedAtAsc":["f16","f18","f17","f15","f07","f02","f13","f11","f05","f06","f01","f12","f14","f10","f08","f03","f04","f09"],"filteredSavedAtDesc":["f14","f13","f11","f12","f10","f09","f08","f07","f06","f05","f04","f03","f02","f01"],"filteredGeneratedAtDesc":["f08","f10","f14","f12","f01","f05","f06","f11","f13","f02","f07","f03","f04","f09"],"filteredGeneratedAtAsc":["f07","f02","f13","f11","f05","f06","f01","f12","f14","f10","f08","f03","f04","f09"],"legacyFiltered":["f09","f02","f06","f01","f12","f04","f05","f10","f03","f14","f07","f08","f13","f11"]}};
const fixture:Fixture=process.env.FAVORITES_SORT_FIXTURE?JSON.parse(fs.readFileSync(process.env.FAVORITES_SORT_FIXTURE,'utf8')):fallbackFixture;
const target=process.env.FAVORITES_SORT_TARGET??process.cwd();
const sourcePath=path.join(target,'src/components/LocalFavorites.tsx');
const sourceText=fs.readFileSync(sourcePath,'utf8');
const ast=ts.createSourceFile(sourcePath,sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const ids=(items:ImageFavorite[])=>items.map(x=>x.id);
const view=(sortBy:FavoritesView['sortBy']='savedAt',sortDirection:FavoritesView['sortDirection']='desc'):FavoritesView=>({pageSize:fixture.pageSize,layout:'grid',sortBy,sortDirection});
function storage(){const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}
function initializer(name:string):string|undefined{let found:string|undefined;function walk(node:ts.Node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===name&&node.initializer)found=node.initializer.getText(ast);ts.forEachChild(node,walk);}walk(ast);return found;}
function evaluate<T>(expression:string,scope:Record<string,unknown>):T{const js=ts.transpileModule('const result=('+expression+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;return new Function(...Object.keys(scope),js+'\nreturn result;')(...Object.values(scope)) as T;}
function uiFiltered(items:ImageFavorite[],date:string,selectedView:FavoritesView):ImageFavorite[]{const expression=initializer('filtered');if(!expression)throw Error('No actual UI filtered expression');return evaluate(expression,{data:{directory:'fixture',items},date,view:selectedView,sortFavoriteItems,useMemo:(fn:()=>unknown)=>fn()});}
function uiPage(filtered:ImageFavorite[],current:number,selectedView:FavoritesView):ImageFavorite[]{let expression:string|undefined;function walk(node:ts.Node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(ast)==='filtered'&&node.expression.name.text==='slice')expression=node.getText(ast);ts.forEachChild(node,walk);}walk(ast);if(!expression)throw Error('No actual UI pagination expression');return evaluate(expression,{filtered,current,view:selectedView});}
function selectorHandler(field:string):string|undefined{let result:string|undefined;function walk(node:ts.Node){if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){const attrs=node.attributes.properties.filter(ts.isJsxAttribute);const value=attrs.find(x=>x.name.getText(ast)==='value');if(value?.initializer&&ts.isJsxExpression(value.initializer)&&value.initializer.expression?.getText(ast)==='view.'+field){const change=attrs.find(x=>x.name.getText(ast)==='onChange');if(change?.initializer&&ts.isJsxExpression(change.initializer))result=change.initializer.expression?.getText(ast);}}ts.forEachChild(node,walk);}walk(ast);return result;}
function runHandler(field:string,value:string){const stored=storage(),state:{view:FavoritesView;page:number;error:string;persistenceFailed:boolean}={view:view(),page:2,error:'',persistenceFailed:false},sortByRef={current:state.view.sortBy};const update=initializer('updateView');if(!update)throw Error('No actual updateView initializer');const reset=initializer('resetBrowse'),setPage=(next:number)=>{state.page=next;},setVisibleLimit=vi.fn();const resetBrowse=reset?evaluate<()=>void>(reset,{setPage,setVisibleLimit,FAVORITES_STREAM_BATCH:Number(initializer('FAVORITES_STREAM_BATCH')??48),gridRef:{current:null},favoritesScrollRoot:()=>null}):()=>setPage(1);const updateView=evaluate<(next:FavoritesView)=>void>(update,{resetBrowse,normalizeFavoritesView,sortByRef,setViewPersistenceFailed:(failed:boolean)=>{state.persistenceFailed=failed;},saveFavoritesView:(next:FavoritesView)=>saveFavoritesView(next,stored),setView:(next:FavoritesView)=>{state.view=next;},setPage:(next:number)=>{state.page=next;},setError:(next:string)=>{state.error=next;}});const handler=selectorHandler(field);if(!handler)return {present:false,state,stored,sortByRef};evaluate<(event:{target:{value:string}})=>void>(handler,{view:state.view,updateView,setPage:(next:number)=>{state.page=next;}})({target:{value}});return {present:true,state,stored,sortByRef};}
afterEach(()=>vi.unstubAllGlobals());

it('defaults fresh and legacy view preferences to savedAt descending',()=>{
 expect(normalizeFavoritesView(null)).toEqual({pageSize:24,layout:'grid',sortBy:'savedAt',sortDirection:'desc'});
 expect(normalizeFavoritesView({pageSize:12,layout:'masonry'})).toEqual({pageSize:12,layout:'masonry',sortBy:'savedAt',sortDirection:'desc'});
});
it('normalizes invalid sort fields without changing valid pagination and layout',()=>{
 expect(normalizeFavoritesView({pageSize:48,layout:'masonry',sortBy:'mtime',sortDirection:'reverse'})).toEqual({pageSize:48,layout:'masonry',sortBy:'savedAt',sortDirection:'desc'});
});
it.each([['savedAt','desc','savedAtDesc'],['savedAt','asc','savedAtAsc'],['generatedAt','desc','generatedAtDesc'],['generatedAt','asc','generatedAtAsc']] as const)('sorts actual helper by %s %s over the same 18-item fixture',(field,direction,key)=>{
 expect(ids(sortFavoriteItems(fixture.items,view(field,direction)))).toEqual(fixture.expected[key]);
});
it.each(['desc','asc'] as const)('keeps missing empty and invalid generated time at the end with deterministic id tie in %s',direction=>{
 expect(ids(sortFavoriteItems(fixture.items,view('generatedAt',direction))).slice(-3)).toEqual(['f03','f04','f09']);
});
it.each(['desc','asc'] as const)('same generated timestamps use persisted id ordering regardless of insertion order in %s',direction=>{
 const equal=fixture.items.filter(x=>['f05','f06'].includes(x.id));expect(ids(equal)).toEqual(['f06','f05']);
 expect(ids(sortFavoriteItems(equal,view('generatedAt',direction)))).toEqual(['f05','f06']);
});
it.each(['desc','asc'] as const)('same saved timestamps use the same deterministic tie rule in %s',direction=>{
 const equal=fixture.items.filter(x=>['f11','f12'].includes(x.id));expect(ids(equal)).toEqual(['f12','f11']);
 expect(ids(sortFavoriteItems(equal,view('savedAt',direction)))).toEqual(['f11','f12']);
});
it('sort does not mutate input arrays or items and retains item identity',()=>{
 const frozen=Object.freeze(fixture.items.map(x=>Object.freeze({...x})));const before=JSON.stringify(frozen);
 const result=sortFavoriteItems(frozen as unknown as ImageFavorite[],view('generatedAt','asc'));
 expect(JSON.stringify(frozen)).toBe(before);expect(result).not.toBe(frozen);
 for(const item of result)expect(frozen.find(x=>x.id===item.id)).toBe(item);
});
it('preserves every item including missing original files for the grid',()=>{
 const result=sortFavoriteItems(fixture.items,view());expect(result).toHaveLength(18);
 expect(result.find(x=>x.id==='f10')?.missing).toBe(true);
});
it.each([['savedAt','desc'],['generatedAt','asc']] as const)('persists %s %s across reload without touching unrelated preferences',(field,direction)=>{
 const store=storage();store.values.set('langbai.metadata-recovery-mode.v1','offline');
 saveFavoritesView(view(field,direction),store);
 expect(loadFavoritesView(store)).toEqual(view(field,direction));expect(store.values.get('langbai.metadata-recovery-mode.v1')).toBe('offline');
 expect(store.values.has(FAVORITES_VIEW_KEY)).toBe(true);
});
it('broken view storage restores the new default rather than unknown ordering',()=>{
 expect(loadFavoritesView({getItem:()=>'{broken',setItem:()=>{}})).toEqual({pageSize:24,layout:'grid',sortBy:'savedAt',sortDirection:'desc'});
});
it('storage failure stays observable rather than pretending sort was persisted',()=>{
 expect(()=>saveFavoritesView(view(),{getItem:()=>null,setItem:()=>{throw Error('fixture read-only');}})).toThrow('fixture read-only');
});
it.each([['savedAt','desc','filteredSavedAtDesc'],['generatedAt','desc','filteredGeneratedAtDesc'],['generatedAt','asc','filteredGeneratedAtAsc']] as const)('actual UI filter uses %s %s before actual pagination',(field,direction,key)=>{
 const selectedView=view(field,direction),filtered=uiFiltered(fixture.items,fixture.filterDate,selectedView);
 expect(ids(filtered)).toEqual(fixture.expected[key]);expect(filtered).toHaveLength(14);
 expect(ids(uiPage(filtered,1,selectedView))).toEqual(fixture.expected[key].slice(0,12));
 expect(ids(uiPage(filtered,2,selectedView))).toEqual(fixture.expected[key].slice(12));
});
it('actual UI all-date branch sorts the complete list without reducing items',()=>{
 expect(ids(uiFiltered(fixture.items,'',view()))).toEqual(fixture.expected.savedAtDesc);
});
it('preview follows sorted filtered order and only skips unavailable originals',()=>{
 const sorted=uiFiltered(fixture.items,fixture.filterDate,view('generatedAt','desc'));
 expect(ids(favoritePreviewItems(sorted))).toEqual(['f08','f14','f12','f01','f05','f06','f11','f13','f02','f07','f03','f09']);
});
it('actual sortBy handler persists generatedAt and resets page to one',()=>{
 const result=runHandler('sortBy','generatedAt');expect(result.present).toBe(true);
 expect(result.state.view.sortBy).toBe('generatedAt');expect(result.state.view.sortDirection).toBe('desc');expect(result.state.page).toBe(1);
 expect(loadFavoritesView(result.stored).sortBy).toBe('generatedAt');expect(result.sortByRef.current).toBe('generatedAt');expect(result.state.persistenceFailed).toBe(false);expect(result.state.error).toBe('');
});
it('actual sortDirection handler persists ascending and resets page to one',()=>{
 const result=runHandler('sortDirection','asc');expect(result.present).toBe(true);
 expect(result.state.view.sortDirection).toBe('asc');expect(result.state.view.sortBy).toBe('savedAt');expect(result.state.page).toBe(1);
 expect(loadFavoritesView(result.stored).sortDirection).toBe('asc');expect(result.state.error).toBe('');
});
it('records real runtime preference and actual UI service-order observation without mocking array logic',()=>{
 const selectedView=normalizeFavoritesView({pageSize:12,layout:'grid',sortBy:'savedAt',sortDirection:'desc'}),filtered=uiFiltered(fixture.items,fixture.filterDate,selectedView);
 const actual={view:selectedView,fixtureDescription:'synthetic shuffled 18-item service response',sourcePath,sourceSha256:createHash('sha256').update(sourceText).digest('hex'),filteredInitializer:initializer('filtered'),inputIds:ids(fixture.items),filteredIds:ids(filtered),page1Ids:ids(uiPage(filtered,1,selectedView)),page2Ids:ids(uiPage(filtered,2,selectedView)),previewIds:ids(favoritePreviewItems(filtered)),sortByHandlerPresent:!!selectorHandler('sortBy'),sortDirectionHandlerPresent:!!selectorHandler('sortDirection'),sameAsLegacyInputFiltering:JSON.stringify(ids(filtered))===JSON.stringify(fixture.expected.legacyFiltered)};
 expect(filtered).toHaveLength(14);expect(fixture.items).toHaveLength(18);
 if(process.env.FAVORITES_REAL_OBSERVATION_FILE)fs.writeFileSync(process.env.FAVORITES_REAL_OBSERVATION_FILE,JSON.stringify(actual,null,2));
 console.info('ACTUAL_FAVORITES_UI_ORDER '+JSON.stringify(actual));
});