export const COMPACT_RESOLUTIONS = [[1024,1024],[1216,832],[832,1216],[1024,1536],[1536,1024],[1472,1472],[1088,1920],[1920,1088],[512,768],[768,512],[640,640]] as const;
export function selectedResolution(width:number,height:number):string {return COMPACT_RESOLUTIONS.some(([w,h])=>w===width&&h===height)?`${width}x${height}`:'custom';}
export function parseResolution(value:string):{width:number;height:number}|null {
  const pair=COMPACT_RESOLUTIONS.find(([w,h])=>`${w}x${h}`===value);return pair?{width:pair[0],height:pair[1]}:null;
}
/** Keep weighted groups intact: removing one comma fragment would corrupt its scope. */
export function capsulePromptUnits(value:string):Array<{start:number;end:number;text:string}> {
  const units:Array<{start:number;end:number;text:string}>=[];
  let start=0,weighted=false;const stack:string[]=[];
  const push=(end:number)=>{const text=value.slice(start,end).trim();if(text)units.push({start,end,text});start=end+1;};
  for(let i=0;i<value.length;i++){
    const char=value[i];
    if(value.slice(i,i+2)==='::'){weighted=!weighted;i++;continue;}
    if('{[('.includes(char))stack.push(char);
    else if('}])'.includes(char)&&stack.length&&'{[('.indexOf(stack[stack.length-1])==='}])'.indexOf(char))stack.pop();
    if(char===','&&!weighted&&!stack.length)push(i);
  }
  push(value.length);return units;
}
export function removeCapsuleUnit(value:string,index:number):string {
  const unit=capsulePromptUnits(value)[index];if(!unit)return value;
  if(unit.start>0)return value.slice(0,unit.start-1)+value.slice(unit.end);
  return value.slice(Math.min(value.length,unit.end+1));
}
export function compactText(language:unknown){
 const translations:Record<string,string[]>={
  'zh-CN':['分辨率','自定义宽高','当前提示词 · 点击 × 移除','添加 Tag','输入 Tag 或词组','关闭','移除','Furry 模式'],
 };return translations[String(language)]??translations['zh-CN'];
}
