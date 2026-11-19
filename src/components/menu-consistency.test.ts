import {it,expect} from 'vitest';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
it('keeps the Windows Studio renderer free of native select and datalist popups',()=>{
 const bad:string[]=[];
 function scan(dir:string){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,f.name);
  if(f.isDirectory()){scan(file);continue;}if(!/\.[jt]sx?$/.test(file)||/\.(?:spec|test)\.[jt]sx?$/.test(file))continue;
  const source=fs.readFileSync(file,'utf8');if(!/select|datalist/.test(source))continue;
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,false,/x$/.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function visit(n:ts.Node){if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
    if(['select','datalist'].includes(n.tagName.getText(ast)))bad.push(file+':'+n.tagName.getText(ast));
   }else if(ts.isCallExpression(n)&&/(?:^|\.)(?:createElement|jsx|jsxs)$/.test(n.expression.getText(ast))&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&['select','datalist'].includes(n.arguments[0].text))bad.push(file+':'+n.arguments[0].text);
   ts.forEachChild(n,visit);}
  visit(ast);
 }}
 scan(path.join(process.cwd(),'src'));expect(bad).toEqual([]);
});
