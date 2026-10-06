import 'package:flutter/material.dart';
import '../inpaint/inpaint_size.dart';
import 'resolution_tiers.dart';

class ResolutionPicker extends StatelessWidget {
  final InpaintSize size;
  final String language;
  final ValueChanged<InpaintSize> onChange;
  final Widget child;
  final int? maxDimension;
  const ResolutionPicker({super.key,required this.size,required this.language,required this.onChange,required this.child,this.maxDimension});

  @override
  Widget build(BuildContext context) {
    final labels=resolutionLabels(language),tier=nearestResolutionTier(size),ratio=nearestResolutionRatio(size);
    final sizeRatio=resolutionPickerRatio(size);
    String tierValue(double v)=>v==v.roundToDouble()?'${v.toInt()}':'$v';
    bool allowed(double t,String r)=>resolutionSizeAllowed(resolutionForTier(t,r),maxDimension);
    void focusDimensions()=>FocusScope.of(context).nextFocus();
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Row(children:[
        Expanded(child:InputDecorator(decoration:InputDecoration(labelText:labels.tier),child:DropdownButtonHideUnderline(child:DropdownButton<String>(
          key:const ValueKey('inpaint-resolution-tier'),value:tier==null?'custom':tierValue(tier),isExpanded:true,
          items:[for(var i=0;i<resolutionTiers.length;i++) DropdownMenuItem(value:tierValue(resolutionTiers[i]),enabled:allowed(resolutionTiers[i],sizeRatio),
            child:Text('${tierValue(resolutionTiers[i])} MP · ${labels.tiers[i]}',overflow:TextOverflow.ellipsis)),DropdownMenuItem(value:'custom',child:Text(labels.custom))],
          onChanged:(v){if(v==null)return;if(v=='custom'){focusDimensions();return;}final t=double.parse(v);if(allowed(t,sizeRatio))onChange(resolutionForTier(t,sizeRatio));},
        )))),
        const SizedBox(width:12),
        Expanded(child:InputDecorator(decoration:InputDecoration(labelText:labels.ratio),child:DropdownButtonHideUnderline(child:DropdownButton<String>(
          key:const ValueKey('inpaint-resolution-ratio'),value:ratio,isExpanded:true,
          items:[for(final r in resolutionRatios) DropdownMenuItem(value:r,enabled:allowed(tier??1,r),child:Text(r)),DropdownMenuItem(value:'custom',child:Text(labels.custom))],
          onChanged:(v){if(v==null)return;if(v=='custom'){focusDimensions();return;}if(allowed(tier??1,v))onChange(resolutionForTier(tier??1,v));},
        )))),
      ]),
      const SizedBox(height:6),
      Text('${size.width} × ${size.height} · ${(size.width*size.height/1000000).toStringAsFixed(3)} MP',key:const ValueKey('inpaint-actual-mp'),style:Theme.of(context).textTheme.bodySmall),
      const SizedBox(height:10),
      child,
    ]);
  }
}
