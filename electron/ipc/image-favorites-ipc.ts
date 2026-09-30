import {app,dialog,ipcMain,type BrowserWindow,type MenuItemConstructorOptions} from 'electron';
import path from 'node:path';
import {createImageFavorites} from './image-favorites';
import {localMediaUrlToPath,toLocalMediaUrl} from './local-media-protocol';
import {getSettings} from './store';
import {favoritesText} from '../../src/favorites-text';
import type {ImageFavorite} from '../../src/favorites-types';
let service:ReturnType<typeof createImageFavorites>|undefined;
const api=()=>service??=createImageFavorites({indexPath:path.join(app.getPath('userData'),'image-favorites.v1.json'),defaultDirectory:path.join(app.getPath('pictures'),'Langbai NovelAI Favorites')});
export const imageFavoritesService=api;
const expose=(item:ImageFavorite)=>({...item,fileUrl:item.missing?'':toLocalMediaUrl(item.filePath,item.id+item.name)});
async function add(src:string){const file=localMediaUrlToPath(src);if(!file)throw Error('请收藏已加载的原始图片。');const result=await api().add(file);return {...result,item:expose(result.item)};}
export function favoriteContextMenuItem(src:string,win:BrowserWindow):MenuItemConstructorOptions {
 const text=favoritesText(getSettings().language);
 return {label:text.favorite,enabled:Boolean(localMediaUrlToPath(src)),click:()=>{
  void add(src).then(r=>{if(!win.isDestroyed())win.webContents.send('favorites:changed',{message:r.duplicate?text.duplicate:text.added});}).catch(e=>{if(!win.isDestroyed())win.webContents.send('favorites:changed',{message:text.failed+': '+String(e)});});
 }};
}
export function registerImageFavoritesIpc(){
 ipcMain.handle('favorites:list',async()=>{const data=await api().list();return {...data,items:data.items.map(expose)};});
 ipcMain.handle('favorites:status',async(_e,src:string)=>{const file=localMediaUrlToPath(src);if(!file)return null;const item=await api().status(file);return item?expose(item):null;});
 ipcMain.handle('favorites:add',(_e,src:string)=>add(src));
 ipcMain.handle('favorites:rename',async(_e,id:string,name:string)=>expose(await api().rename(id,name)));
 ipcMain.handle('favorites:remove',(_e,id:string)=>api().remove(id));
 ipcMain.handle('favorites:directory',async()=>{
  const state=await api().list();const result=await dialog.showOpenDialog({title:favoritesText(getSettings().language).choose,defaultPath:state.directory,properties:['openDirectory','createDirectory']});
  if(result.canceled||!result.filePaths[0])return null;return api().setDirectory(result.filePaths[0]);
 });
}
