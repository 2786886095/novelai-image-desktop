import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{isPackaged:false,getPath:()=>fixture.root,getAppPath:()=>fixture.root},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()}}));
beforeEach(()=>{fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-language-'));vi.resetModules();});
afterEach(()=>{
 if(path.dirname(fixture.root)!==path.resolve(os.tmpdir())||!path.basename(fixture.root).startsWith('legacy-language-'))throw Error('Invalid fixture cleanup');
 fs.rmSync(fixture.root,{recursive:true,force:true});
});
for(const language of ['en-US','ja-JP','ko-KR','zh-TW','fr-FR'])it(`settings saved by an older version with UI language ${language} load as Simplified Chinese`,async()=>{
 const file=path.join(fixture.root,'novelai-image-desktop.json');
 fs.writeFileSync(file,JSON.stringify({settings:{language,theme:'dark',translateTargetLanguage:'ja',translateProvider:'baidu'}}));
 const {getSettings,setSetting}=await import('./store');
 // Only the UI language is normalized; content-language settings such as the translation target are kept.
 expect(getSettings()).toMatchObject({language:'zh-CN',theme:'dark',translateTargetLanguage:'ja',translateProvider:'baidu'});
 expect(setSetting('language',language as never)).toBe('zh-CN');
 expect(JSON.parse(fs.readFileSync(file,'utf8')).settings).toMatchObject({language:'zh-CN',theme:'dark',translateTargetLanguage:'ja'});
});
