import 'dart:math' as math;
import '../inpaint/inpaint_size.dart';

const resolutionTiers = [0.4, 1.0, 1.5, 2.0, 3.0];
const resolutionRatios = ['1:1','2:3','3:2','3:4','4:3','9:16','16:9','1:2','2:1','1:3','3:1','21:9','9:21'];

// Same 1024² tier convention and 64px lattice as desktop resolution-tiers.ts.
InpaintSize resolutionForTier(double tier, String ratio) {
  if (!resolutionTiers.contains(tier)) throw const FormatException('Unknown resolution tier');
  final parts = ratio.split(':').map(double.tryParse).toList();
  if (parts.length != 2 || parts.any((v) => v == null)) throw const FormatException('Invalid aspect ratio');
  final aspect = parts[0]! / parts[1]!;
  if (!aspect.isFinite || aspect < 1/768 || aspect > 768) throw const FormatException('Invalid aspect ratio');
  final cap = math.min(3*1024*1024, tier == 0.4 ? 409600 : (tier*1024*1024).round());
  InpaintSize best = (width:64,height:64);
  var score = double.infinity;
  for (var width=64; width<=cap/64; width+=64) {
    final ideal=width/aspect;
    for (final height in [(ideal/64).floor()*64,(ideal/64).ceil()*64,(cap/width/64).floor()*64,
      (ideal*math.exp(.079)/64).floor()*64,(ideal*math.exp(-.079)/64).ceil()*64]) {
      if (height<64 || width*height>cap) continue;
      final ratioError=math.log((width/height)/aspect).abs();
      final usable=width*height>=cap*.80 && ratioError<.08;
      final error=(usable?0:100)+4*ratioError+math.log(width*height/cap).abs();
      if (error<score) { score=error;best=(width:width,height:height); }
    }
  }
  return best;
}

String nearestResolutionRatio(InpaintSize size) {
  for(final ratio in resolutionRatios) {
    final p=ratio.split(':').map(int.parse).toList();
    if(math.log((size.width/size.height)/(p[0]/p[1])).abs()<.045) return ratio;
  }
  return 'custom';
}
double? nearestResolutionTier(InpaintSize size) {
  final pixels=size.width*size.height;
  for(final tier in resolutionTiers) {
    final cap=tier==.4?409600:tier*1024*1024;
    if(pixels<=cap && pixels>=cap*.80) return tier;
  }
  return null;
}
String resolutionPickerRatio(InpaintSize size) {
  final ratio=nearestResolutionRatio(size);
  if(ratio!='custom') return ratio;
  final aspect=size.width/size.height;
  return size.width>0 && size.height>0 && aspect>=1/768 && aspect<=768 ? '${size.width}:${size.height}' : '1:1';
}
bool resolutionSizeAllowed(InpaintSize size, [int? maxDimension]) => [size.width,size.height]
  .every((v)=>v>=64 && v%64==0 && (maxDimension==null || v<=maxDimension));

({String tier,String ratio,String custom,List<String> tiers}) resolutionLabels(String language) => switch(language) {
  'zh-CN' => (tier:'总分辨率',ratio:'画面比例',custom:'自定义',tiers:['小图','普通','大图','超大图','最大']),
  'zh-TW' => (tier:'總解析度',ratio:'畫面比例',custom:'自訂',tiers:['小圖','一般','大圖','超大圖','最大']),
  'ja-JP' => (tier:'画素数',ratio:'縦横比',custom:'カスタム',tiers:['小','通常','大','特大','最大']),
  'ko-KR' => (tier:'픽셀 크기',ratio:'화면 비율',custom:'사용자 지정',tiers:['작게','보통','크게','매우 크게','최대']),
  _ => (tier:'Pixel tier',ratio:'Aspect ratio',custom:'Custom',tiers:['Small','Normal','Large','Extra large','Maximum']),
};
