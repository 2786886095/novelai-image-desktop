import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';

describe('account selector preserves the application layout',()=>{
 it('nests the selector inside the title-bar toolbar rather than adding a layout row',()=>{
  const source=ts.createSourceFile('App.tsx',readFileSync('src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let shell:ts.JsxElement|undefined;
  function walk(node:ts.Node){if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(source)==='className'&&/^"app-shell\b/.test(p.initializer?.getText(source)??'')))shell=node;ts.forEachChild(node,walk);}
  walk(source);expect(shell).toBeDefined();
  const children=shell!.children.filter(n=>ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n));
  const tag=(node:ts.JsxElement|ts.JsxSelfClosingElement)=>ts.isJsxElement(node)?node.openingElement.tagName.getText(source):node.tagName.getText(source);
  expect(children.map(tag)).not.toContain('NaiAccountManager');
  const toolbar=children.find(n=>tag(n)==='StudioTopBar');expect(toolbar).toBeDefined();
  expect(toolbar!.getText(source)).toContain('account={<NaiAccountManager />}');
  const chrome=readFileSync('src/shell/StudioShell.tsx','utf8');
  expect(chrome).toContain('account: ReactNode');
  expect(chrome).toMatch(/<header className="shell-topbar[^"]*"[\s\S]*<div className="shell-account">\{account\}<\/div>[\s\S]*<\/header>/);
 });
});
