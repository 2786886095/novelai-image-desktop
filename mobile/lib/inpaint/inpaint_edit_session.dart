import 'dart:typed_data';
import '../models/nai_models.dart';
import 'inpaint_mask.dart';
import 'inpaint_size.dart';
class InpaintEditSession {
 final WorkingImage source;
 final WorkingImage? original;
 final String sourceMode,engine,sizeMode;
 final InpaintSize customSize;
 final InpaintRegion? region;
 final Uint8List maskBytes;
 final List<InpaintStroke> strokes;
 final bool inverted;
 InpaintEditSession({required this.source,required this.original,required this.sourceMode,required this.engine,required this.sizeMode,required this.customSize,required this.region,required Uint8List maskBytes,required List<InpaintStroke> strokes,required this.inverted}):maskBytes=Uint8List.fromList(maskBytes),strokes=copyInpaintStrokes(strokes);
}
