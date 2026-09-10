import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  test(
      'issue 6 account/image endpoints are repaired without duplicated operations',
      () {
    final s = AppSettings();
    expect(
        resolveNovelAiBaseUrl(
            'https://image.novelai.net', 'https://api.novelai.net', s),
        'https://api.novelai.net');
    expect(
        resolveNovelAiBaseUrl('https://image.novelai.net/ai/generate-image',
            'https://image.novelai.net', s),
        'https://image.novelai.net');
  });
  test('intermediary prefixes are retained only with explicit opt-in', () {
    final s = AppSettings();
    expect(
        resolveNovelAiBaseUrl('https://proxy.example/nai/ai/generate-image',
            'https://image.novelai.net', s),
        'https://image.novelai.net');
    s.allowCustomEndpoint = true;
    expect(
        resolveNovelAiBaseUrl('https://proxy.example/nai/ai/generate-image',
            'https://image.novelai.net', s),
        'https://proxy.example/nai');
  });
}
