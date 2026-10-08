import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../models/automatic_comparison.dart';
import 'before_after_compare.dart';
/// Same local preferences and exact-tool ownership as desktop. Manual selection is per result.
class AutomaticComparisonControl extends StatefulWidget {
 final String surface;const AutomaticComparisonControl({super.key,required this.surface});
 @override State<AutomaticComparisonControl> createState()=>_AutomaticComparisonControlState();
}
class _AutomaticComparisonControlState extends State<AutomaticComparisonControl>{
 bool? manual;String? identity;
 @override Widget build(BuildContext context){
 final s=context.watch<AppState>(),labels=comparisonLabels(s.settings.language);
 final automatic=normalizeAutomaticComparison(s.settings.automaticComparison)[widget.surface]!;
 final before=s.comparisonBefore,after=s.comparisonAfter;
 final canCompare=s.comparisonSurface==widget.surface && before!=null && after!=null;
 final next='${widget.surface}|${before?.filePath}|${after?.filePath}';
 if(identity!=next){identity=next;manual=false;}
 if(canCompare&&s.comparisonAutoOpenPending){manual=automatic;s.comparisonAutoOpenPending=false;}
 final show=canCompare&&(manual??false);
 return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
 if(automaticComparisonAllowed(widget.surface)) SwitchListTile(key:ValueKey('auto-compare-${widget.surface}'),contentPadding:EdgeInsets.zero,title:Text(labels[0]),subtitle:Text(labels[1]),value:automatic,onChanged:(value)async{try{await s.setAutomaticComparison(widget.surface,value);}catch(e){if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}}),
 if(canCompare) ...[
 Align(alignment:Alignment.centerLeft,child:TextButton.icon(key:ValueKey('manual-compare-${widget.surface}'),onPressed:()=>setState(()=>manual=!show),icon:const Icon(Icons.compare),label:Text(labels[show?3:2]))),
 if(show) SizedBox(height:320,child:BeforeAfterCompare(beforePath:before.filePath,afterPath:after.filePath)),
 ]]);}
}
