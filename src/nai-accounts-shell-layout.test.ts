import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';

describe('account selector preserves the application grid',()=>{
 it('nests the selector inside the existing toolbar rather than adding a grid row',()=>{
  const source=ts.createSourceFile('App.tsx',readFileSync('src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let shell:ts.JsxElement|undefined;
  function walk(node:ts.Node){if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(source)==='className'&&p.initializer?.getText(source)==='"app-shell"'))shell=node;ts.forEachChild(node,walk);}
  walk(source);expect(shell).toBeDefined();
  const children=shell!.children.filter(n=>ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n));
  const tag=(node:ts.JsxElement|ts.JsxSelfClosingElement)=>ts.isJsxElement(node)?node.openingElement.tagName.getText(source):node.tagName.getText(source);
  expect(children.map(tag)).not.toContain('NaiAccountManager');
  const toolbar=children.find(n=>tag(n)==='AppMenuBar');expect(toolbar&&ts.isJsxElement(toolbar)).toBe(true);
  expect(toolbar!.getText(source)).toContain('<NaiAccountManager />');
  const chrome=readFileSync('src/app/AppChrome.tsx','utf8');expect(chrome).toContain('children?: ReactNode');expect(chrome).toContain('{children}');
 });
});
