import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  final relay = Uri.parse('https://relay.example/ai/generate-image');
  final official = Uri.parse('https://image.novelai.net/ai/generate-image');

  test('official fallback is opt-in and persisted off by default', () {
    final settings = AppSettings();
    expect(settings.allowCustomEndpointFallback, isFalse);
    expect(AppSettings.fromJson({}).allowCustomEndpointFallback, isFalse);
    expect(shouldFallbackToOfficialImageEndpoint(relay, 401, settings), isFalse);
    settings.allowCustomEndpointFallback = true;
    expect(AppSettings.fromJson(settings.toJson()).allowCustomEndpointFallback,
        isTrue);
    expect(shouldFallbackToOfficialImageEndpoint(relay, 401, settings), isTrue);
    expect(shouldFallbackToOfficialImageEndpoint(relay, 403, settings), isTrue);
  });

  test('fallback is limited to relay 401/403 and cannot loop', () {
    final settings = AppSettings(allowCustomEndpointFallback: true);
    for (final status in [200, 400, 404, 408, 429, 500, 503]) {
      expect(shouldFallbackToOfficialImageEndpoint(relay, status, settings),
          isFalse);
    }
    expect(shouldFallbackToOfficialImageEndpoint(official, 401, settings),
        isFalse);
    settings.allowCustomEndpoint = false;
    expect(shouldFallbackToOfficialImageEndpoint(relay, 403, settings), isFalse);
  });
}
