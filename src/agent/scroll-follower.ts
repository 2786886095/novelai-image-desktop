export interface StudioScrollSurface {scrollTop:number;readonly scrollHeight:number;readonly clientHeight:number;}
/** Layout growth must not be mistaken for an intentional upward scroll. */
export function createStudioScrollFollower(surface:StudioScrollSurface,frame:(work:()=>void)=>number,cancel:(id:number)=>void,onFollowing:(value:boolean)=>void){
 let following=true,pending:number|undefined,disposed=false,lastTop=surface.scrollTop;
 const pin=()=>{if(disposed||!following||pending!==undefined)return;pending=frame(()=>{pending=undefined;if(!disposed&&following)surface.scrollTop=Math.max(0,surface.scrollHeight-surface.clientHeight);});};
 return {pin,latest(){following=true;onFollowing(true);surface.scrollTop=Math.max(0,surface.scrollHeight-surface.clientHeight);pin();},restore(value:boolean){following=value;onFollowing(value);if(value)pin();},intentUp(){if(surface.scrollHeight<=surface.clientHeight)return;following=false;lastTop=surface.scrollTop;if(pending!==undefined){cancel(pending);pending=undefined;}onFollowing(false);},scrolled(){const previous=lastTop;lastTop=surface.scrollTop;if(following){pin();return;}if(surface.scrollTop>previous&&surface.scrollHeight-surface.clientHeight-surface.scrollTop<=1){following=true;onFollowing(true);pin();}},dispose(){disposed=true;if(pending!==undefined)cancel(pending);}};
}
