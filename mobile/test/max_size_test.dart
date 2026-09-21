import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/images/upscale_plan.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/billing/anlas.dart';

void main() {
  test('MAX caps every request, including panoramas and large originals', () {
    for (final size in [
      (832, 1216),
      (1024, 1024),
      (500, 500),
      (8000, 6000),
      (100, 20000),
      (20000, 100)
    ]) {
      final p = planUpscale(size.$1, size.$2, 0);
      expect(p.exceedsLimit, false);
      expect(p.width, lessThanOrEqualTo(4096));
      expect(p.height, lessThanOrEqualTo(4096));
      expect(p.inputWidth * p.inputHeight * (p.passes == 2 ? 4 : 1),
          lessThanOrEqualTo(3145728));
    }
  });
  test('4x validates the second request and costs it independently', () {
    expect(planUpscale(1024, 1024, 4).exceedsLimit, true);
    expect(planUpscale(512, 512, 4).exceedsLimit, false);
    final quote = calculateUpscaleAnlas(
        image: const WorkingImage(filePath: 'test', width: 800, height: 800),
        account: const AccountSummary(),
        scale: 4);
    expect(quote.amount, 5);
  });
  test('official V5 MAX output and persisted MAX selection', () {
    expect(maxNaiEnhanceSize(832, 1216), (width: 1467, height: 2144));
    expect(AppSettings.fromJson({'upscaleScale': 0}).upscaleScale, 0);
    expect(AppSettings.fromJson({'upscaleScale': 123}).upscaleScale, 2);
  });
}
