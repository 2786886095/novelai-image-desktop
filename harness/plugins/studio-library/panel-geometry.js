// CSS pixels, constrained against the currently visible viewport (including keyboards).
export function defaultPanel(v){
 const width=Math.min(420,Math.max(1,v.width-16)),height=Math.min(660,Math.max(1,v.height-32));
 return clampPanel({x:v.x+v.width-width-16,y:v.y+56,width,height},v);
}
export function clampPanel(rect,v){
 const pad=Math.min(8,v.width/4,v.height/4),maxW=Math.max(1,v.width-pad*2),maxH=Math.max(1,v.height-pad*2);
 const width=Math.min(maxW,Math.max(Math.min(300,maxW),rect.width));
 const height=Math.min(maxH,Math.max(Math.min(260,maxH),rect.height));
 return {x:Math.min(v.x+v.width-pad-width,Math.max(v.x+pad,rect.x)),y:Math.min(v.y+v.height-pad-height,Math.max(v.y+pad,rect.y)),width,height};
}
export function changePanel(rect,dx,dy,resize,v){
 // Resize cannot push the opposite edge: clamp to the remaining visible space.
 const next=resize?{...rect,width:Math.min(v.x+v.width-8-rect.x,rect.width+dx),height:Math.min(v.y+v.height-8-rect.y,rect.height+dy)}:{...rect,x:rect.x+dx,y:rect.y+dy};
 return clampPanel(next,v);
}
