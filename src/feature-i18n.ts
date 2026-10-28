import {featureText} from './feature-text';
export {featureText} from './feature-text';
const ft=(key:string,params?:Record<string,string|number>)=>featureText(undefined,key,params);
/** Message formatter for components; a stable function, so the `ft` call sites stay unchanged. */
export function useFeatureText(){
  return ft;
}
