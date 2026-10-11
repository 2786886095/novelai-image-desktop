import {useCallback} from 'react';
import {useAppStore} from './store';
import {featureText} from './feature-text';
export {featureText,FEATURE_LANGUAGES} from './feature-text';
export function useFeatureText(){
  const language=useAppStore(s=>s.settings?.language);
  return useCallback((key:string,params?:Record<string,string|number>)=>featureText(language,key,params),[language]);
}
