/** Keep the saved order intact: only its fitting prefix is visible. */
export function countTabsThatFit(widths:readonly number[],available:number,gap:number,moreWidth:number) {
 const total=widths.reduce((a,b)=>a+b,0)+Math.max(0,widths.length-1)*gap;
 if(total<=available)return widths.length;
 const room=Math.max(0,available-moreWidth-gap);let used=0,count=0;
 for(const width of widths){const next=used+width+(count?gap:0);if(next>room)break;used=next;count++;}
 return count;
}
