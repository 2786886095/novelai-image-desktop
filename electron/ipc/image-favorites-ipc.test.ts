import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';
import {it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({root:'',handlers:new Map<string,Function>(),pick:vi.fn()}));
vi.mock('electron',()=>({app:{getPath:(key:string)=>path.join(fixture.root,key)},ipcMain:{handle:(key:string,fn:Function)=>fixture.handlers.set(key,fn)},dialog:{showOpenDialog:fixture.pick}}));
vi.mock('./store',()=>({getSettings:()=>({language:'zh-CN'})}));
import {registerImageFavoritesIpc,favoriteContextMenuItem} from './image-favorites-ipc';
import {toLocalMediaUrl} from './local-media-protocol';
it('right-click saves original once with toast, IPC reads it, raw/unregistered paths are rejected',async()=>{
 fixture.root=await fs.mkdtemp(path.join(os.tmpdir(),'favorites-ipc-'));
 try{
  registerImageFavoritesIpc();const source=path.join(fixture.root,'original.png'),bytes=await sharp({create:{width:4,height:6,channels:3,background:'#675a98'}}).png().toBuffer();await fs.writeFile(source,bytes);
  const send=vi.fn(),win={isDestroyed:()=>false,webContents:{send}} as any;
  expect(favoriteContextMenuItem('file:///private.png',win).enabled).toBe(false);
  await expect(fixture.handlers.get('favorites:add')!({},source)).rejects.toThrow();
  const menu=favoriteContextMenuItem(toLocalMediaUrl(source),win);expect(menu.label).toBe('收藏图片');expect(menu.enabled).toBe(true);(menu.click as Function)();
  await vi.waitFor(()=>expect(send).toHaveBeenCalledWith('favorites:changed',{message:'已收藏图片'}));expect(fixture.pick).not.toHaveBeenCalled();
  const state=await fixture.handlers.get('favorites:list')!({});expect(state.items).toHaveLength(1);expect(state.items[0].fileUrl).toMatch(/^nai-local:/);expect(await fs.readFile(state.items[0].filePath)).toEqual(bytes);
  expect((await fixture.handlers.get('favorites:status')!({},toLocalMediaUrl(source))).id).toBe(state.items[0].id);
  expect(await fixture.handlers.get('favorites:status')!({},source)).toBeNull();
  (menu.click as Function)();await vi.waitFor(()=>expect(send).toHaveBeenCalledWith('favorites:changed',{message:'图片已在收藏夹'}));
  fixture.pick.mockResolvedValueOnce({canceled:true,filePaths:[]});expect(await fixture.handlers.get('favorites:directory')!({})).toBeNull();expect((await fixture.handlers.get('favorites:list')!({})).directory).toBe(state.directory);
 }finally{await fs.rm(fixture.root,{recursive:true,force:true});}
});
