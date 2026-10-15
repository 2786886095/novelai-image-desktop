import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
import {DEFAULT_PARAMS,type GenerateExtras} from '../src/types';
import {calculateFeatureAnlasQuote} from '../src/anlas';

const bridge=vi.hoisted(()=>({apis:{} as Record<string,any>,invoke:vi.fn().mockResolvedValue({ok:false,items:[]})}));
vi.mock('electron',()=>({contextBridge:{exposeInMainWorld:(name:string,api:any)=>{bridge.apis[name]=api;}},
 ipcRenderer:{invoke:bridge.invoke,on:vi.fn(),removeListener:vi.fn()},webUtils:{getPathForFile:vi.fn()}}));
import './preload';

const extras:GenerateExtras={vibeImages:[],charCaptions:[{prompt:'fixture character',useCoords:true,x:0.3,y:0.5}],
 preciseReferences:[{base64:'fixture reference only',type:'character',strength:1,fidelity:1}]};
const region={x:128,y:128,width:256,height:256};
const args=[DEFAULT_PARAMS,'nai-diffusion-4-5-full-inpainting','fixture-mask',0.8,0,region,extras] as const;

it('real preload inpaint bridge forwards the seventh extras argument after region',async()=>{
 bridge.invoke.mockClear();await bridge.apis.naiDesktop.inpaint(...args);
 expect(bridge.invoke).toHaveBeenCalledExactlyOnceWith('nai:inpaint',...args);
});

it('actual main-process registered inpaint callback forwards extras without booting Electron or reading a profile',async()=>{
 const file=path.resolve('electron/main.ts'),text=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);let callback:ts.Expression|undefined;
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='accountBoundHandle'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='nai:inpaint')callback=node.arguments[1];ts.forEachChild(node,visit);};visit(ast);
 expect(callback).toBeDefined();
 const compiled=ts.transpileModule('const handler = '+callback!.getText(ast)+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const called=vi.fn().mockResolvedValue({ok:false,items:[]});
 const handler=Function('inpaintImage',compiled+'; return handler;')(called);
 await handler({},...args);expect(called).toHaveBeenCalledExactlyOnceWith(...args);
});

it('inpaint quote includes the selected V4.5 precise reference fee instead of clearing extras',()=>{
 const request={feature:'inpaint' as const,params:{...DEFAULT_PARAMS,model:'nai-diffusion-5-full' as const,width:512,height:512},
  inpaintModel:'nai-diffusion-4-5-full-inpainting' as const,inpaintStrength:1,account:{hasToken:true,anlasBalance:100}};
 const before=structuredClone(extras);const plain=calculateFeatureAnlasQuote(request),withReference=calculateFeatureAnlasQuote({...request,extras});
 expect(plain.ok).toBe(true);expect(withReference.ok).toBe(true);expect(withReference.amount!-plain.amount!).toBe(5);expect(extras).toEqual(before);
});
