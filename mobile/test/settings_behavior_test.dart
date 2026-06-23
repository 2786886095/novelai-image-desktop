import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';

void main() {
  group('settings migration and safety', () {
    test('legacy Tag URL enables the remote service during migration', () {
      final settings = AppSettings.fromJson({
        'tagServerUrl': 'http://127.0.0.1:3000/mcp',
      });
      expect(settings.tagServerEnabled, isTrue);
    });

    test('settings round-trip preserves mobile parity options', () {
      final source = AppSettings(
        allowCustomEndpoint: true,
        theme: 'dark',
        proxyForNai: false,
        translateProvider: 'baidu',
        baiduAppId: 'example-id',
        historyRetentionDays: 90,
        keepImageMetadata: false,
        saveToGallery: false,
        imageNameTemplate: '{date}_{seed}_{type}',
        promptShortcuts: [
          PromptShortcutTemplate(
            id: '1',
            name: '测试',
            prefix: 'masterpiece',
          ),
        ],
      );
      final restored = AppSettings.fromJson(source.toJson());

      expect(restored.allowCustomEndpoint, isTrue);
      expect(restored.theme, 'dark');
      expect(restored.proxyForNai, isFalse);
      expect(restored.translateProvider, 'baidu');
      expect(restored.historyRetentionDays, 90);
      expect(restored.keepImageMetadata, isFalse);
      expect(restored.saveToGallery, isFalse);
      expect(restored.promptShortcuts.single.name, '测试');
    });

    test('custom NovelAI endpoints require explicit opt-in', () {
      const official = 'https://api.novelai.net';
      final settings = AppSettings();
      expect(
        resolveNovelAiBaseUrl('http://127.0.0.1:9000/', official, settings),
        official,
      );
      expect(
        resolveNovelAiBaseUrl(
          'https://image.novelai.net/',
          'https://image.novelai.net',
          settings,
        ),
        'https://image.novelai.net',
      );
      settings.allowCustomEndpoint = true;
      expect(
        resolveNovelAiBaseUrl('http://127.0.0.1:9000/', official, settings),
        'http://127.0.0.1:9000',
      );
    });

    test('proxy scopes are independent', () {
      final settings = AppSettings(
        proxyForNai: false,
        proxyForMcp: true,
        proxyForAi: false,
        proxyForUpdate: true,
        proxyForTranslate: false,
      );
      expect(proxyEnabledForScope(settings, ProxyScope.nai), isFalse);
      expect(proxyEnabledForScope(settings, ProxyScope.mcp), isTrue);
      expect(proxyEnabledForScope(settings, ProxyScope.ai), isFalse);
      expect(proxyEnabledForScope(settings, ProxyScope.update), isTrue);
      expect(proxyEnabledForScope(settings, ProxyScope.translate), isFalse);
      expect(proxyEnabledForScope(settings, null), isTrue);
    });
  });
}
