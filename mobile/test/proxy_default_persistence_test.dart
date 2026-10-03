// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/tags/offline_tag_store.dart';

class _OwnedPaths extends PathProviderPlatform {
  final String root;
  _OwnedPaths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

// Only credentials/network update discovery are excluded. Settings reads,
// writes, AppState.load and setSettings are the real production methods.
class _NoCredentialsStorage extends Storage {
  @override
  Future<String?> getToken() async => null;
}
class _QuietState extends AppState {
  _QuietState() : super(storage: _NoCredentialsStorage(), offlineTags: _QuietTags());
  @override
  Future<void> checkUpdate({bool manual = false}) async {}
}
class _QuietTags extends OfflineTagStore {
  @override
  Future<OfflineTagStatus> status() async => const OfflineTagStatus();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('langbai.novelai/network');
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  for (final target in ['android', 'ios-phone', 'ios-tablet', 'windows']) {
    for (final input in ['absent', 'missing-mode', 'auto', 'http', 'custom', 'socks5', 'direct', 'choose-direct']) {
      test('proxy cold persistence $target $input', () async {
        final root = Directory.systemTemp.createTempSync('owned-proxy-default-');
        final oldPaths = PathProviderPlatform.instance;
        PathProviderPlatform.instance = _OwnedPaths(root.path);
        debugDefaultTargetPlatformOverride = target == 'windows' ? TargetPlatform.windows : target.startsWith('ios') ? TargetPlatform.iOS : TargetPlatform.android;
        final mode = ['absent', 'missing-mode', 'choose-direct'].contains(input) ? 'auto' : input;
        final url = switch (input) {
          'http' => 'http://127.0.0.1:7890',
          'custom' => 'http://127.0.0.1:17892',
          'socks5' => 'socks5://127.0.0.1:10809',
          _ => '',
        };
        final saved = AppSettings(proxyMode: mode, proxyUrl: url, proxyForMcp: false, proxyForTranslate: false).toJson();
        if (input == 'missing-mode') saved.remove('proxyMode');
        SharedPreferences.setMockInitialValues(input == 'absent' || input == 'choose-direct' ? {} : {'app_settings': jsonEncode(saved)});
        messenger.setMockMethodCallHandler(channel, (call) async => 'http://127.0.0.1:17891');
        setResolvedSystemProxyForTesting('');
        final states = <_QuietState>[];
        addTearDown(() {
          for (final state in states) { state.dispose(); }
          messenger.setMockMethodCallHandler(channel, null);
          setResolvedSystemProxyForTesting('');
          debugDefaultTargetPlatformOverride = null;
          PathProviderPlatform.instance = oldPaths;
          root.deleteSync(recursive: true);
        });
        final first = _QuietState(); states.add(first);
        await first.load();
        expect(first.booted, isTrue);
        if (input == 'choose-direct') {
          await first.setSettings((s) => s.proxyMode = 'direct');
        }
        final second = _QuietState(); states.add(second);
        await second.load();
        final durable = await Storage().getSettings();
        final expectedMode = input == 'choose-direct' ? 'direct' : mode;
        final route = parseProxySettings(second.settings);
        print('PROXY_PERSISTENCE target=$target input=$input expected=$expectedMode/$url first=${first.settings.proxyMode}/${first.settings.proxyUrl} cold=${second.settings.proxyMode}/${second.settings.proxyUrl} durable=${durable.proxyMode}/${durable.proxyUrl} route=${route.kind.name}/${route.port} automatic=${route.automatic};0HTTP/0credits');
        expect(second.settings.proxyMode, expectedMode);
        expect(second.settings.proxyUrl, url);
        expect(durable.proxyMode, expectedMode);
        expect(durable.proxyUrl, url);
        if (input != 'absent' && input != 'choose-direct') {
          expect(second.settings.proxyForMcp, isFalse);
          expect(second.settings.proxyForTranslate, isFalse);
        }
        expect(route.automatic, expectedMode == 'auto');
        if (expectedMode == 'auto') expect(route.port, 17891);
        if (expectedMode == 'direct') expect(route.kind, ProxyKind.direct);
        if (expectedMode == 'http') expect(route.port, 7890);
        if (expectedMode == 'custom') expect(route.port, 17892);
        if (expectedMode == 'socks5') expect(route.port, 10809);
      });
    }
  }
}
