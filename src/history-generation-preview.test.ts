import {readFileSync} from 'node:fs';
import React from 'react';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';

// Exercise the actual thumbnail and dialog handlers without an Electron window
// or an image-generation request. State is retained across simulated renders.
const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const panel=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='HistoryPanel')!;
const code=ts.transpileModule(panel.getText(ast),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(redesign:boolean){
 const state={history:['A','B'].map(id=>({id,fileUrl:id,filePath:id})),isGenerating:true,historyDates:[],historyGroups:[],settings:{},selectImage:vi.fn()};
 let cursor=0;const slots:any[]=[];
 const deps={React,useAppStore:(select:any)=>select(state),useState:(initial:any)=>{const i=cursor++;if(i>=slots.length)slots[i]=initial;return [slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useCallback:(v:any)=>v,useRef:()=>({current:null}),useVirtualizer:()=>({}),desktopUiText:(_:unknown,k:string)=>k,desktopUiFormat:()=>'',dockText:()=>({}),favoritesText:()=>({}),clsx:()=>'',ImagePreviewDialog:'dialog-fixture',Icon:'icon-fixture',SelectMenu:'select-fixture',ConvertedHistoryRestoreButton:'restore-fixture',HistoryItemMenu:'menu-fixture'};
 const renderPanel=new Function(...Object.keys(deps),code+';return HistoryPanel;')(...Object.values(deps));
 function render(){cursor=0;const nodes:any[]=[];function visit(x:any){if(Array.isArray(x)){x.forEach(visit);return;}if(x?.props){nodes.push(x);visit(x.props.children);}}visit(renderPanel({redesign}));
 return {thumbs:nodes.filter(n=>n.type==='button'&&n.props['aria-label']==='history.thumbAlt'),dialog:nodes.find(n=>n.type==='dialog-fixture')?.props};}
 return {state,render};
}
describe.each([false,true])('history rail while generating (redesign=%s)',redesign=>{
 it('browses a snapshot across task completion without selecting canvas images',()=>{
   const {state,render}=fixture(redesign);render().thumbs[1].props.onClick();
   let d=render().dialog;expect(d).toBeDefined();expect(d.images[d.index].src).toBe('B');
   d.onIndex(0);state.history=[{id:'new',fileUrl:'new',filePath:'new'},...state.history];state.isGenerating=false;
   d=render().dialog;expect(d.images[d.index].src).toBe('A');expect(d.images.length).toBe(2);
   d.onClose();expect(render().dialog).toBeUndefined();expect(state.selectImage).not.toHaveBeenCalled();
 });
 it('retains the original thumbnail selection when idle',()=>{
   const {state,render}=fixture(redesign);state.isGenerating=false;render().thumbs[1].props.onClick();
   expect(state.selectImage).toHaveBeenCalledExactlyOnceWith(state.history[1]);expect(render().dialog).toBeUndefined();
 });
});
