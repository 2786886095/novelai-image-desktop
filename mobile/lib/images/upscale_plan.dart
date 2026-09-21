import 'dart:math' as math;

// 0 is the persisted MAX choice; 2/4 retain their existing meaning.
({
  int inputWidth,
  int inputHeight,
  int width,
  int height,
  int passes,
  bool resized,
  bool exceedsLimit
}) planUpscale(int width, int height, int scale) {
  if (width <= 0 || height <= 0 || ![0, 2, 4].contains(scale)) {
    throw const FormatException('Invalid upscale size or mode');
  }
  const maxInputPixels = 3145728;
  final factor = scale == 0
      ? [
          4.0,
          4096 / width,
          4096 / height,
          math.sqrt(4 * maxInputPixels / (width * height))
        ].reduce(math.min)
      : math.min(1.0, math.sqrt(maxInputPixels / (width * height))) * scale;
  final passes = scale == 4 || (scale == 0 && factor > 2) ? 2 : 1;
  final divisor = 1 << passes;
  final iw = math.max(1, (width * factor / divisor).floor());
  final ih = math.max(1, (height * factor / divisor).floor());
  final ow = iw * divisor, oh = ih * divisor;
  return (
    inputWidth: iw,
    inputHeight: ih,
    width: ow,
    height: oh,
    passes: passes,
    resized: iw != width || ih != height,
    exceedsLimit: ow > 4096 ||
        oh > 4096 ||
        iw * ih * math.pow(4, passes - 1) > maxInputPixels
  );
}
