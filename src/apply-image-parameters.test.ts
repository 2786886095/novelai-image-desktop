import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useAppStore} from './store';
import {applyImageParameters} from './apply-image-parameters';
import {resolveCanvasImage} from './canvas-preview';
import fs from 'node:fs';
const image={filePath:'favorite.png',fileUrl:'nai-local://favorite',width:832,height:1216};
beforeEach(()=>useAppStore.setState(useAppStore.getInitialState(),true));
afterEach(()=>vi.unstubAllGlobals());
it('favorites and native load-parameters restore all embedded data on the generation tab',async()=>{
 const imported={model:'nai-diffusion-5-full',positivePrompt:'original detailed prompt',negativePrompt:'embedded negative',seed:718,cfgScale:6,steps:28,sampler:'k_euler_ancestral',width:832,height:1216};
 const api={loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image,metadata:{imported,characterCaptions:[]}})};
 vi.stubGlobal('window',{naiDesktop:api});useAppStore.setState({activeTab:'galleryFavorites'} as any);
 expect(await applyImageParameters(image.filePath)).toBe(true);
 expect(useAppStore.getState().activeTab).toBe('generate');
 expect(useAppStore.getState().params).toMatchObject(imported);
 expect(resolveCanvasImage(useAppStore.getState())).toBe(image);
 expect(api.loadImageFromPath).toHaveBeenCalledOnce();
});
it('parameter application never changes a running generation',async()=>{
 const api={loadImageFromPath:vi.fn()};vi.stubGlobal('window',{naiDesktop:api});
 useAppStore.setState({isGenerating:true,activeTab:'tools'});
 const params=useAppStore.getState().params;
 expect(await applyImageParameters('favorite.png')).toBe(false);expect(api.loadImageFromPath).not.toHaveBeenCalled();
 expect(useAppStore.getState().activeTab).toBe('tools');expect(useAppStore.getState().params).toBe(params);
});
it('missing metadata keeps parameters and explicitly explains the fallback',async()=>{
 vi.stubGlobal('window',{naiDesktop:{loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image})}});
 const params=useAppStore.getState().params;await applyImageParameters(image.filePath);
 expect(useAppStore.getState().params).toBe(params);expect(useAppStore.getState().toast).toContain('no generation metadata found');
});
it('main drop/paste opts into metadata only on generation, history thumbnail remains image-only',()=>{
 const app=fs.readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
 expect(app).toContain('loadWorkbenchFromPath(filePath, {restoreMetadata: activeTab === "generate"})');
 const store=fs.readFileSync(new URL('./store.ts',import.meta.url),'utf8');
 expect(store).toContain('restoreMetadata: false');
 const favorites=fs.readFileSync(new URL('./components/LocalFavorites.tsx',import.meta.url),'utf8');
 expect(favorites.indexOf('{text.rename}</button>')).toBeLessThan(favorites.indexOf('{text.apply}</button>'));
 expect(favorites.indexOf('{text.apply}</button>')).toBeLessThan(favorites.indexOf('{text.remove}</button>'));
 expect(favorites).toContain('onImageParametersRequested?.');
});
