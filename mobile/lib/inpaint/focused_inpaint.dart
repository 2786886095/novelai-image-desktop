import 'dart:math' as math;
import '../models/nai_models.dart';

typedef InpaintRegion = ({int x, int y, int width, int height});
const focusedSelectionMaxPixels = 589824;
const focusedWorkMaxPixels = 1048576;
InpaintRegion clipInpaintRegion(InpaintRegion r, int width, int height) {
 if(width<=0||height<=0||r.width<8||r.height<8)throw const FormatException('Select at least 8 × 8 source pixels.');
 final x=math.max(0,r.x),y=math.max(0,r.y),right=math.min(width,r.x+r.width),bottom=math.min(height,r.y+r.height);
 if(right-x<8||bottom-y<8)throw const FormatException('Selection lies outside the image.');
 return (x:x,y:y,width:right-x,height:bottom-y);
}
({int width,int height}) _capped(int width,int height){
 if(width*height<=focusedSelectionMaxPixels)return (width:width,height:height);
 final scale=math.sqrt(focusedSelectionMaxPixels/(width*height));var w=(width*scale).floor(),h=(height*scale).floor();
 if(w<8){w=8;h=math.min(height,focusedSelectionMaxPixels~/w);}if(h<8){h=8;w=math.min(width,focusedSelectionMaxPixels~/h);}
 return (width:w,height:h);
}
InpaintRegion clampFocusedInpaintRegion(InpaintRegion r,int width,int height){final c=clipInpaintRegion(r,width,height),s=_capped(c.width,c.height);return(x:c.x,y:c.y,width:s.width,height:s.height);}
InpaintRegion clampFocusedInpaintDrag(double ax,double ay,double ex,double ey,int width,int height){
 if(![ax,ay,ex,ey].every((v)=>v.isFinite)||width<=0||height<=0)throw const FormatException('Invalid selection coordinates.');
 int snap(double v,int bound)=>((v/8).round()*8).clamp(0,bound).toInt();
 final x=snap(ax,width),y=snap(ay,height),dx=snap(ex,width)-x,dy=snap(ey,height)-y;
 final s=dx.abs()<8||dy.abs()<8?(width:dx.abs(),height:dy.abs()):_capped(dx.abs(),dy.abs());
 return(x:dx<0?x-s.width:x,y:dy<0?y-s.height:y,width:s.width,height:s.height);
}
({InpaintRegion region,({int width,int height}) size}) focusedInpaintPlan(InpaintRegion r,int width,int height){
 final c=clampFocusedInpaintRegion(r,width,height),area=c.width*c.height;
 final scale=area<.8*focusedWorkMaxPixels?math.sqrt(focusedWorkMaxPixels/area):1.0;
 var w=math.max(64,(c.width*scale).floor()~/64*64),h=math.max(64,(c.height*scale).floor()~/64*64);
 if(w*h>focusedWorkMaxPixels){if(w<h){h=focusedWorkMaxPixels~/w~/64*64;}else{w=focusedWorkMaxPixels~/h~/64*64;}}
 return(region:c,size:(width:w,height:h));
}
GenerateExtras focusedInpaintExtras(GenerateExtras extras,InpaintRegion? region,int width,int height){
 final copy=extras.copy();if(region!=null){for(final c in copy.charCaptions){if(c.useCoords){c.x=((c.x*width-region.x)/region.width).clamp(0,1).toDouble();c.y=((c.y*height-region.y)/region.height).clamp(0,1).toDouble();}}}return copy;
}
