import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';import JSZip from 'jszip';
import {buildComicSelectedZip,writeComicZip,readComicImage,readComicReferences} from './comic-assets';
import {createTagComicPanel,createTagComicProject,buildTagComicGenerateRequest} from '../../src/comic/tag-comic';
import {DEFAULT_PARAMS} from '../../src/types';
const mocks=vi.hoisted(()=>({root:'',group:vi.fn(),token:vi.fn(),save:vi.fn()}));
vi.mock('electron',()=>({app:{getPath:()=>mocks.root},dialog:{showSaveDialog:mocks.save},nativeImage:{},protocol:{}}));
vi.mock('./store',()=>({getSettings:()=>({outputDir:mocks.root}),getToken:mocks.token,ensureHistoryGroup:mocks.group}));
let root:string,png:Buffer;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'comic-assets-'));mocks.root=root;vi.clearAllMocks();png=await sharp({create:{width:3,height:2,channels:3,background:'#765'}}).png().toBuffer();await fs.writeFile(path.join(root,'one.png'),png);});
afterEach(async()=>{if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('comic-assets-'))throw Error('Unexpected fixture root');await fs.rm(root,{recursive:true,force:true});});
function project(){const p=createTagComicProject(DEFAULT_PARAMS);p.panels=[createTagComicPanel('forest',1),createTagComicPanel('sea',2)];for(const panel of p.panels){panel.selectedCandidateId='candidate';panel.candidates=[{id:'candidate',historyItemId:'history',outputPath:path.join(root,'one.png'),outputUrl:'file://private',createdAt:'today'}];}return p;}
it('ZIP contains every selected image in panel order, prompts and no local paths',async()=>{
 const p=project();p.panels.reverse();const built=await buildComicSelectedZip(p,root);const zip=await JSZip.loadAsync(built.bytes,{checkCRC32:true});
 expect(built.imageCount).toBe(2);expect(await zip.file('images/001.png')!.async('nodebuffer')).toEqual(png);const manifest=await zip.file('project.json')!.async('string');expect(manifest).not.toContain(root);expect(manifest).not.toContain('file://');expect(JSON.parse(manifest).panels.map((x:any)=>x.index)).toEqual([1,2]);
 const saved=await writeComicZip(path.join(root,'export.zip'),built.bytes);expect(saved.sha256).toBe(built.sha256);expect(await fs.readFile(saved.filePath)).toEqual(built.bytes);
});
it('missing selected image aborts the complete ZIP rather than silently omitting a panel',async()=>{const p=project();p.panels[1].candidates[0].outputPath=path.join(root,'missing.png');await expect(buildComicSelectedZip(p,root)).rejects.toThrow('第2格');});
it('stale selection and duplicate panel indexes do not ship an ambiguous archive',async()=>{const p=project();p.panels[0].selectedCandidateId='missing';await expect(buildComicSelectedZip(p,root)).rejects.toThrow('主图记录');p.panels[0].selectedCandidateId='candidate';p.panels[1].index=1;await expect(buildComicSelectedZip(p,root)).rejects.toThrow('序号');});
it('unselected panels are intentionally omitted, never treated as missing images',async()=>{const p=project();p.panels[1].selectedCandidateId=undefined;expect((await buildComicSelectedZip(p,root)).imageCount).toBe(1);});
it('corrupt images and magic-only fake PNGs are rejected by actual decoding',async()=>{await fs.writeFile(path.join(root,'bad.png'),Buffer.concat([png.subarray(0,8),Buffer.from('broken')]));await expect(readComicImage(path.join(root,'bad.png'),root)).rejects.toThrow();});
it('directory junction escaping the approved root is rejected',async()=>{
 const inside=path.join(root,'inside'),outside=path.join(root,'outside');await fs.mkdir(inside);await fs.mkdir(outside);await fs.writeFile(path.join(outside,'one.png'),png);await fs.symlink(outside,path.join(inside,'escape'),'junction');
 await expect(readComicImage(path.join(inside,'escape','one.png'),inside)).rejects.toThrow('目录');await fs.unlink(path.join(inside,'escape'));
});
it('exclusive write never replaces an existing export; temporary file is cleaned on failure',async()=>{const target=path.join(root,'existing.zip');await fs.writeFile(target,'original');await expect(writeComicZip(target,png)).rejects.toThrow();expect(await fs.readFile(target,'utf8')).toBe('original');expect((await fs.readdir(root)).some(n=>n.endsWith('.tmp'))).toBe(false);});
it('all selected reference bytes and parameters are retained; one missing reference rejects the batch',async()=>{
 const request=buildTagComicGenerateRequest(project(),project().panels[0]);request.preciseReferences=[{referenceId:'r',enabled:true,filePath:path.join(root,'one.png'),type:'character',strength:.5,fidelity:.8,informationExtracted:1}];
 const refs=await readComicReferences(request,root);expect(Buffer.from(refs[0].base64,'base64')).toEqual(png);expect(refs[0].strength).toBe(.5);request.preciseReferences.push({...request.preciseReferences[0],filePath:path.join(root,'gone.png')});await expect(readComicReferences(request,root)).rejects.toThrow('尚未提交生图');
});
it('invalid reference strengths fail before reading files',async()=>{const request=buildTagComicGenerateRequest(project(),project().panels[0]);request.preciseReferences=[{referenceId:'r',enabled:true,filePath:'missing',type:'character',strength:NaN,fidelity:1,informationExtracted:1}];await expect(readComicReferences(request,root)).rejects.toThrow('参数');});
it('actual native generator stops before history group, token or paid generation when a reference is missing',async()=>{
 const {generateTagComicCandidate}=await import('./nai');const p=project(),request=buildTagComicGenerateRequest(p,p.panels[0]);request.preciseReferences=[{referenceId:'r',enabled:true,filePath:path.join(root,'missing.png'),type:'character',strength:1,fidelity:1,informationExtracted:1}];
 const result=await generateTagComicCandidate(request);expect(result.ok).toBe(false);expect(result.message).toContain('尚未提交生图');expect(mocks.group).not.toHaveBeenCalled();expect(mocks.token).not.toHaveBeenCalled();
});
it('actual native ZIP action fails before a save dialog for missing selected images',async()=>{const {exportTagComicSelectedZip}=await import('./nai');const p=project();p.panels[1].candidates[0].outputPath=path.join(root,'gone.png');const result=await exportTagComicSelectedZip({project:p});expect(result.ok).toBe(false);expect(result.message).toContain('第2格');expect(mocks.save).not.toHaveBeenCalled();});
it('actual native reference importer verifies pixels and actual scoped file',async()=>{const {importTagComicReference}=await import('./nai');const result=await importTagComicReference({projectId:'fixture-project',sourcePath:path.join(root,'one.png')});expect(result.ok).toBe(true);expect(await fs.readFile(result.asset!.filePath)).toEqual(png);await fs.writeFile(path.join(root,'bad.png'),png.subarray(0,8));expect((await importTagComicReference({projectId:'fixture-project',sourcePath:path.join(root,'bad.png')})).ok).toBe(false);});
it('native overwrite authorization replaces an existing ZIP with verified bytes',async()=>{const target=path.join(root,'approved.zip');await fs.writeFile(target,'original');const bytes=(await buildComicSelectedZip(project(),root)).bytes;await writeComicZip(target,bytes,true);expect(await fs.readFile(target)).toEqual(bytes);expect((await fs.readdir(root)).some(n=>n.endsWith('.tmp'))).toBe(false);});
