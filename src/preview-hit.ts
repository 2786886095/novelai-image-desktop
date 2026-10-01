/** The img box can include contain-letterboxing; those pixels are backdrop, not image. */
export function previewImageContainsPoint(bounds: {left:number;top:number;width:number;height:number}, naturalWidth:number, naturalHeight:number, x:number, y:number, contain=true) {
  if (bounds.width<=0||bounds.height<=0) return false;
  let width=bounds.width,height=bounds.height;
  if(contain&&naturalWidth>0&&naturalHeight>0){const scale=Math.min(width/naturalWidth,height/naturalHeight);width=naturalWidth*scale;height=naturalHeight*scale;}
  const left=bounds.left+(bounds.width-width)/2,top=bounds.top+(bounds.height-height)/2;
  return x>=left&&x<=left+width&&y>=top&&y<=top+height;
}
