import {expect,it} from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';

function controls(index=0,navigation?:{onPrevious?:()=>void;onNext?:()=>void}) {
 const source=fs.readFileSync('src/components/PreviewImageViewer.tsx','utf8');
 const ast=ts.createSourceFile('PreviewImageViewer.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const viewer=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PreviewImageViewer') as ts.FunctionDeclaration;
 const extract=(name:string)=>(viewer.body!.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name) as ts.FunctionDeclaration).getText(ast);
 const calls:string[]=[];
 const env={root:{current:{focus:(options:FocusOptions)=>{expect(options).toEqual({preventScroll:true});calls.push('focus');}}},navigation,index,images:[{},{}],onIndex:(i:number)=>calls.push('index:'+i),setScale:(s:number)=>calls.push('scale:'+s),setPan:(p:{x:number;y:number})=>calls.push('pan:'+p.x+','+p.y)};
 const body=`const {root,navigation,index,images,onIndex,setScale,setPan}=env;${extract('move')};${extract('zoom')};return {move,zoom};`;
 return {calls,...new Function('env',ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(env)} as {calls:string[];move:(d:number)=>void;zoom:(n:number)=>void};
}

it('returns focus to the preview before navigation disables the last or first button',()=>{
 const next=controls(0);next.move(1);expect(next.calls).toEqual(['focus','index:1']);
 const previous=controls(1);previous.move(-1);expect(previous.calls).toEqual(['focus','index:0']);
});
it('external navigation retains focus, while unavailable navigation does not steal it',()=>{
 let called=0;const external=controls(0,{onNext:()=>called++});external.move(1);expect(external.calls).toEqual(['focus']);expect(called).toBe(1);
 const unavailable=controls(0,{});unavailable.move(1);expect(unavailable.calls).toEqual([]);
 const boundary=controls(1);boundary.move(1);expect(boundary.calls).toEqual([]);
});
it('zoom boundaries retain Escape and Tab routing without changing pan or limits',()=>{
 for(const value of [1,8]){const p=controls();p.zoom(value);expect(p.calls).toEqual(['focus','scale:'+value,'pan:0,0']);}
});
