export const COMPACT_RESOLUTIONS = [[1024,1024],[1216,832],[832,1216],[1024,1536],[1536,1024],[1472,1472],[1088,1920],[1920,1088],[512,768],[768,512],[640,640]] as const;
export function selectedResolution(width:number,height:number):string {return COMPACT_RESOLUTIONS.some(([w,h])=>w===width&&h===height)?`${width}x${height}`:'custom';}
export function parseResolution(value:string):{width:number;height:number}|null {
  const pair=COMPACT_RESOLUTIONS.find(([w,h])=>`${w}x${h}`===value);return pair?{width:pair[0],height:pair[1]}:null;
}
/** Keep weighted groups intact: removing one comma fragment would corrupt its scope. */
export function capsulePromptUnits(value:string):Array<{start:number;end:number;text:string}> {
  const units:Array<{start:number;end:number;text:string}>=[];
  let start=0,weighted=false,quote='';const stack:string[]=[];
  const push=(end:number)=>{const text=value.slice(start,end).trim();if(text)units.push({start,end,text});start=end+1;};
  for(let i=0;i<value.length;i++){
    const char=value[i];
    if(char==='\\'){i++;continue;}
    if(quote){if(char===quote)quote='';continue;}
    if(char==='"'||char==='“'){quote=char==='“'?'”':'"';continue;}
    if(value.slice(i,i+2)==='::'&&!stack.length){
      if(weighted)weighted=false;
      else if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.slice(start,i).trim()))weighted=true;
      i++;continue;
    }
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
const numberWeight = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*::([\s\S]+)::$/;
type CapsuleTag = {core:string;weight:number;adjustable:boolean;parent:number;member:number;members:string[]};
function editableTag(core:string) {
  // Don't rewrite free-form quoting, scoped braces, or an unfinished weight group.
  return !/[{}\[\]"“”\r\n]/.test(core) && !core.includes('::');
}

export function capsuleTagUnits(value:string):CapsuleTag[] {
  return capsulePromptUnits(value).flatMap(({text},parent)=>{
    const numeric=text.match(numberWeight);
    if(numeric&&Number.isFinite(Number(numeric[1]))&&!numeric[2].includes('::')){
      const members=capsulePromptUnits(numeric[2]).map(x=>x.text);
      if(members.length&&members.every(editableTag)){
        return members.map((core,member)=>({core,weight:Number(numeric[1]),adjustable:true,parent,member,members}));
      }
    } else {
      const wrapped=text.match(/^([\[{]+)\s*([^{}\[\],]+?)\s*([\]}]+)$/);
      if(wrapped&&([...wrapped[1]].reverse().map(x=>x==='{'?'}':']').join('')===wrapped[3])&&editableTag(wrapped[2])){
        const level=[...wrapped[1]].reduce((n,x)=>n+(x==='{'?1:-1),0);
        return [{core:wrapped[2],weight:Math.round(1.05**level*100)/100,adjustable:true,parent,member:0,members:[wrapped[2]]}];
      }
    }
    return [{core:text,weight:1,adjustable:editableTag(text),parent,member:0,members:[text]}];
  });
}

function replaceCapsuleParent(value:string,parent:number,replacement:string) {
  const unit=capsulePromptUnits(value)[parent];
  if(!unit)return value;
  const inner=value.slice(unit.start,unit.end),at=unit.start+inner.indexOf(unit.text);
  return value.slice(0,at)+replacement+value.slice(at+unit.text.length);
}
function weightedCapsuleTag(core:string,weight:number) {
  return weight===1 ? core : `${weight}::${core}::`;
}
export function changeCapsuleWeight(value:string,index:number,direction:1|-1) {
  const tag=capsuleTagUnits(value)[index];
  if(!tag?.adjustable)return value;
  const next=Math.max(Math.min(-5,tag.weight),Math.min(Math.max(5,tag.weight),Math.round((tag.weight+direction*0.1)*100)/100));
  if(tag.weight===next)return value;
  return replaceCapsuleParent(value,tag.parent,tag.members.map((core,i)=>weightedCapsuleTag(core,i===tag.member?next:tag.weight)).join(", "));
}
export function removeCapsuleTag(value:string,index:number) {
  const tag=capsuleTagUnits(value)[index];
  if(!tag)return value;
  if(tag.members.length===1)return removeCapsuleUnit(value,tag.parent);
  return replaceCapsuleParent(value,tag.parent,tag.members.filter((_,i)=>i!==tag.member).map(core=>weightedCapsuleTag(core,tag.weight)).join(", "));
}

export function capsuleWheelDirection(input: {deltaY:number;deltaX:number;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean}): 1|-1|0 {
  const {deltaX,deltaY,ctrlKey,metaKey,shiftKey}=input;
  if(ctrlKey||metaKey||shiftKey||!Number.isFinite(deltaY)||!deltaY||Math.abs(deltaX)>Math.abs(deltaY))return 0;
  return deltaY<0?1:-1;
}

export function capsuleWeightText(language:unknown) {
 const labels:Record<string,readonly [string,string,string]> = {
  'zh-CN':['增加权重','降低权重','鼠标移到标签文字上滚动：向上加权，向下减权 · 每次 0.1'],
  'zh-TW':['提高權重','降低權重','滑鼠移到標籤文字上捲動：向上加權，向下減權 · 每次 0.1'],
  'en-US':['Increase weight','Decrease weight','Scroll over a tag label to change its weight by 0.1.'],
  'ja-JP':['重みを上げる','重みを下げる','タグの文字にポインターを合わせてスクロールすると、重みを 0.1 ずつ調整できます。'],
  'ko-KR':['가중치 높이기','가중치 낮추기','태그 글자 위에서 스크롤하면 가중치가 0.1씩 바뀝니다.'],
 };
 return labels[String(language)]??labels['en-US'];
}

export function compactText(language:unknown){
 const translations:Record<string,string[]>={
  'zh-CN':['分辨率','自定义宽高','当前提示词 · 点击 × 移除','添加 Tag','输入 Tag 或词组','关闭','移除','Furry 模式'],
  'zh-TW':['解析度','自訂寬高','目前提示詞 · 點選 × 移除','新增 Tag','輸入 Tag 或詞組','關閉','移除','Furry 模式'],
  'en-US':['Resolution','Custom dimensions','Current prompt · × to remove','Add tag','Enter a tag or phrase','Close','Remove','Furry mode'],
  'ja-JP':['解像度','幅・高さを指定','現在のプロンプト · × で削除','タグを追加','タグや語句を入力','閉じる','削除','Furry モード'],
  'ko-KR':['해상도','너비·높이 직접 설정','현재 프롬프트 · ×로 삭제','태그 추가','태그 또는 구문 입력','닫기','삭제','Furry 모드'],
 };return translations[String(language)]??translations['en-US'];
}
