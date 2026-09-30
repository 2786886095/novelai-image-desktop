import 'dart:async';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/state/app_state.dart';

Future<NovelAiAccounts> memoryVault(
    {String? legacy, AppSettings? settings}) async {
  String? document;
  final vault = NovelAiAccounts(
      read: () async => document,
      write: (v) async {
        document = v;
      });
  await vault.load(
      legacyToken: () async => legacy,
      legacySettings: () async => settings ?? AppSettings());
  return vault;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'migration copies once, never deletes legacy, reload preserves selected account',
      () async {
    String? document;
    var reads = 0;
    Future<String?> legacy() async {
      reads++;
      return 'legacy-secret';
    }

    final vault = NovelAiAccounts(
        read: () async => document,
        write: (v) async {
          document = v;
        });
    await vault.load(
        legacyToken: legacy, legacySettings: () async => AppSettings());
    expect(vault.active!.token, 'legacy-secret');
    expect(vault.profiles.single.id, 'legacy-v1');
    expect(
        jsonEncode(vault.profiles.single.toJson()), isNot(contains('secret')));
    final second =
        await vault.add(label: 'B', method: 'token', token: 'B-token');
    await vault.activate(second.id);
    final again = NovelAiAccounts(
        read: () async => document,
        write: (v) async {
          document = v;
        });
    await again.load(
        legacyToken: legacy, legacySettings: () async => AppSettings());
    expect(reads, 1);
    expect(again.profiles.length, 2);
    expect(again.active!.token, 'B-token');
    await again.activate(null);
    expect(again.active, isNull);
    expect(again.profiles.length, 2);
  });
  test(
      'legacy custom route remains relay, never gains official credential endpoint',
      () async {
    final vault = await memoryVault(
        legacy: 'relay-only',
        settings: AppSettings()
          ..allowCustomEndpoint = true
          ..imageBaseUrl = 'https://relay.example/prefix/ai/generate-image');
    expect(vault.active!.profile.imageBaseUrl, 'https://relay.example/prefix');
    expect(vault.active!.profile.apiBaseUrl, 'https://relay.example/prefix');
    expect(vault.active!.profile.method, 'relay');
  });
  test('OS vault failure cannot commit activation or overwrite live state',
      () async {
    String? doc;
    var fail = false;
    final vault = NovelAiAccounts(
        read: () async => doc,
        write: (v) async {
          if (fail) throw StateError('vault unavailable');
          doc = v;
        });
    await vault.load(
        legacyToken: () async => 'legacy',
        legacySettings: () async => AppSettings());
    final before = doc;
    fail = true;
    await expectLater(vault.activate(null), throwsStateError);
    expect(doc, before);
    expect(vault.active!.token, 'legacy');
  });
  test('corrupt existing vault fails closed without migration or rewrite',
      () async {
    var writes = 0, legacyReads = 0;
    final vault = NovelAiAccounts(
        read: () async => 'broken',
        write: (_) async {
          writes++;
        });
    await expectLater(
        vault.load(
            legacyToken: () async {
              legacyReads++;
              return 'old';
            },
            legacySettings: () async => AppSettings()),
        throwsFormatException);
    expect(writes, 0);
    expect(legacyReads, 0);
  });
  test('concurrent vault writes serialize by denying the second operation',
      () async {
    var delay = false;
    final gate = Completer<void>();
    final vault = NovelAiAccounts(
        read: () async => null,
        write: (_) async {
          if (delay) await gate.future;
        });
    await vault.load(
        legacyToken: () async => 'A',
        legacySettings: () async => AppSettings());
    delay = true;
    final change = vault.activate(null);
    await expectLater(
        vault.add(label: 'B', method: 'token', token: 'B'), throwsStateError);
    await expectLater(vault.operation((s) async => s.token), throwsStateError);
    gate.complete();
    await change;
  });
  test(
      'full operation lease rejects activate/remove/add and releases after exception',
      () async {
    final vault = await memoryVault(legacy: 'A');
    await expectLater(vault.operation((snapshot) async {
      final mutable = AppSettings();
      final frozen = snapshot.settings(mutable);
      mutable.imageBaseUrl = 'https://wrong.example';
      expect(frozen.imageBaseUrl, 'https://image.novelai.net');
      await expectLater(vault.activate(null), throwsStateError);
      await expectLater(vault.remove(snapshot.profile.id), throwsStateError);
      await expectLater(
          vault.add(label: 'B', method: 'token', token: 'B'), throwsStateError);
      throw StateError('operation ended');
    }), throwsStateError);
    expect(vault.locked, false);
    await vault.activate(null);
  });
  test('OS secure storage integration leaves original nai_token untouched',
      () async {
    FlutterSecureStorage.setMockInitialValues({'nai_token': 'original'});
    final vault = NovelAiAccounts();
    final storage = NovelAiAccountStorage(vault);
    await storage.getToken();
    final b = await vault.add(label: 'B', method: 'token', token: 'second');
    await vault.activate(b.id);
    expect(await storage.getToken(), 'second');
    expect(
        await const FlutterSecureStorage().read(key: 'nai_token'), 'original');
    final persisted =
        await const FlutterSecureStorage().read(key: NovelAiAccounts.vaultKey);
    expect(persisted, contains('second'));
    expect(persisted, isNot(contains('password')));
    await storage.clearToken();
    expect(await storage.getToken(), isNull);
    expect(
        await const FlutterSecureStorage().read(key: 'nai_token'), 'original');
  });
  test(
      'AppState checks busy before activation; endpoint and balance change together',
      () async {
    final vault = await memoryVault(legacy: 'A');
    final p = await vault.add(
        label: 'Relay',
        method: 'relay',
        token: 'relay-token',
        apiBaseUrl: 'https://relay.example/raw',
        imageBaseUrl: 'https://relay.example/raw');
    final app = AppState(
        storage: NovelAiAccountStorage(vault), api: NovelAiAccountApi(vault));
    addTearDown(app.dispose);
    app.busy = true;
    await expectLater(app.activateNaiAccount(p.id), throwsStateError);
    expect(vault.active!.token, 'A');
    app.busy = false;
    app.account = const AccountSummary(hasToken: true, anlasBalance: 999);
    await app.activateNaiAccount(p.id);
    expect(app.settings.imageBaseUrl, 'https://relay.example/raw');
    expect(app.settings.allowCustomEndpointFallback, false);
    expect(app.account.anlasBalance, isNull);
    expect(await app.storage.getToken(), 'relay-token');
  });
  test('exact endpoints, no official relay, no dashboards, route normalization',
      () {
    for (final base in [
      'http://r.example',
      'https://a:b@r.example',
      'https://r.example?key=x',
      'https://r.example/dashboard',
      'https://r.example/login',
      'https://image.novelai.net',
      'https://novelai.net'
    ]) {
      expect(
          () => NovelAiAccount(
                  id: 'r',
                  label: 'R',
                  method: 'relay',
                  apiBaseUrl: base,
                  imageBaseUrl: base)
              .validate('r'),
          throwsFormatException);
    }
    for (final base in [
      'https://image.novelai.net:444',
      'https://image.novelai.net/path',
      'https://other.example'
    ]) {
      expect(
          () => NovelAiAccount(
                  id: 'o', label: 'O', method: 'token', imageBaseUrl: base)
              .validate('o'),
          throwsFormatException);
    }
    expect(
        NovelAiAccount.normalizeBase('https://relay.example/nai/ai/upscale/'),
        'https://relay.example/nai');
  });
}
