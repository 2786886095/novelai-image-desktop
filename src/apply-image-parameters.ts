import {useAppStore} from './store';
import {favoritesText} from './favorites-text';
/** Explicit parameter load. Ordinary history selection remains image-only. */
export async function applyImageParameters(filePath:string) {
 const state=useAppStore.getState();
 if(state.isGenerating){state.setToast(favoritesText(state.settings?.language).busyGeneration);return false;}
 if(!filePath)return false;
 state.setActiveTab('generate');
 await useAppStore.getState().loadWorkbenchFromPath(filePath,{restoreMetadata:true});
 return true;
}
