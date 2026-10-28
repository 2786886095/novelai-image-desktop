/** Format an application message, filling {name} placeholders from params. The UI is Simplified Chinese only, so the key is the text. */
export function featureText(_language:string|undefined,key:string,params:Record<string,string|number>={}):string {
  return key.replace(/\{(\w+)\}/g,(token,name)=>params[name]===undefined?token:String(params[name]));
}
