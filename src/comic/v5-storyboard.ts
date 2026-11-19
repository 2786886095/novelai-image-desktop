export const layoutIds = [...Array.from({length:20},(_,i)=>'L'+(i+1)),...Array.from({length:6},(_,i)=>'S'+(i+1))];
export interface V5Panel{position:string;camera:string;scene:string;actors:string;action:string;dialogue:string[];balloon:string;sfx:string;transition:string}
export interface V5Page{purpose:string;layout:string;ending:string;turn:string;cuts:string;panels:V5Panel[]}
export interface V5Storyboard{nodes:string;pacing:string;cuts:string;characters:string;pages:V5Page[]}
export const storyboardSystem='你是日式漫画分镜编辑。只输出一个 JSON 对象，不写生图提示词。nodes=剧情结构及分支取舍，pacing=页级节奏，cuts=删减或合并，characters=逐人彩色与黑白身份卡（发色、发型、瞳色、体型、服装）与场景、光线锚。pages 数组按页序：每项含 purpose,layout（L1–L20 或 S1–S6）,ending,turn,cuts,panels。每格含 position（格位与大小）,camera,scene,actors（位置与视线）,action,dialogue（字符串数组，0–2条，每条2–12个汉字）,balloon（位置、顺序和尾巴指向）,sfx,transition。所有非数组字段是字符串。默认图内气泡。整页漫画每页4–8格，单分镜模式每页一格。右至左，上至下，每页最多4条气泡。不要复制原文凑数。';
const fail=():never=>{throw Error('分镜脚本字段、页数或气泡数量无效；未发送编译请求');};
const val=(v:any,n=3000):string=>typeof v==='string'&&v.length<=n?v:fail();
export function parseV5Storyboard(raw:string,count:number,single:boolean):V5Storyboard{
 if(raw.length>160000||!Number.isInteger(count)||count<1||count>30)fail();
 const x=JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/i,'$1'));
 if(!x||!Array.isArray(x.pages)||x.pages.length!==count)fail();
 const pages=x.pages.map((p:any)=>{
 if(!p||!layoutIds.includes(p.layout)||!Array.isArray(p.panels)||p.panels.length<(single?1:4)||p.panels.length>(single?1:8))fail();
 let bubbles=0;
 const panels=p.panels.map((a:any)=>{if(!a||!Array.isArray(a.dialogue)||a.dialogue.length>2)fail();bubbles+=a.dialogue.length;return{position:val(a.position),camera:val(a.camera),scene:val(a.scene),actors:val(a.actors),action:val(a.action),balloon:val(a.balloon),sfx:val(a.sfx),transition:val(a.transition),dialogue:a.dialogue.map((d:any)=>val(d,750))};});
 if(bubbles>4)fail();
 return {purpose:val(p.purpose),layout:p.layout,ending:val(p.ending),turn:val(p.turn),cuts:val(p.cuts),panels};});
 return {nodes:val(x.nodes,10000),pacing:val(x.pacing,10000),cuts:val(x.cuts,10000),characters:val(x.characters,20000),pages};
}
