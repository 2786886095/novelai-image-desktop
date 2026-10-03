import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/unified_storage.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

class _VerifiedStorage extends NovelAiAccountStorage {
  _VerifiedStorage(super.accounts);
  final requests = <({String method, String url, String kind})>[];
  int? failedRequest;
  Future<void> Function()? duringFirstRead;
  @override
  Future<AccountSummary> verifyBackupAccount(
          NovelAiCredentialSnapshot snapshot, AppSettings settings) =>
      NovelAiAccountApi(accounts,
          clientFactory: (_, __) => MockClient((r) async {
                final relay =
                    r.headers['Authorization']?.contains('fixture-relay') ==
                        true;
                requests.add((
                  method: r.method,
                  url: r.url.toString(),
                  kind: relay ? 'relay' : 'official'
                ));
                expect(r.method, 'GET');
                expect(r.url.host.endsWith('novelai.net'), !relay);
                if (requests.length == 1) await duringFirstRead?.call();
                if (requests.length == failedRequest) {
                  return http.Response('', 401);
                }
                return relay
                    ? (r.url.path.endsWith('/models')
                        ? http.Response(
                            jsonEncode({
                              'object': 'list',
                              'data': [
                                {'id': 'nai-diffusion-5-full'}
                              ]
                            }),
                            200)
                        : http.Response('', 404))
                    : http.Response(
                        jsonEncode({
                          'subscription': {
                            'tier': 0,
                            'active': false,
                            'trainingStepsLeft': {
                              'fixedTrainingStepsLeft': 42,
                              'purchasedTrainingSteps': 0
                            }
                          }
                        }),
                        200);
              })).verifyCandidate(snapshot, settings);
}

Map<String, dynamic> portable() => {
      'version': 1,
      'selectedId': 'relay',
      'accounts': [
        {
          'id': 'official',
          'label': 'saved official',
          'method': 'token',
          'token': 'fixture-official',
          'apiBaseUrl': 'https://api.novelai.net',
          'imageBaseUrl': 'https://image.novelai.net',
          'accountSummary': {
            'tierName': 'Paper',
            'tierLevel': 0,
            'anlasBalance': 23,
            'hasActiveSubscription': false
          }
        },
        {
          'id': 'login',
          'label': 'saved login',
          'method': 'official-login',
          'token': 'fixture-login',
          'apiBaseUrl': 'https://api.novelai.net',
          'imageBaseUrl': 'https://image.novelai.net',
          'accountSummary': {
            'tierName': 'Paper',
            'tierLevel': 0,
            'anlasBalance': 31,
            'hasActiveSubscription': false
          }
        },
        {
          'id': 'relay',
          'label': 'selected relay',
          'method': 'relay',
          'token': 'fixture-relay',
          'apiBaseUrl': 'https://relay.example.invalid/prefix',
          'imageBaseUrl': 'https://images.example.invalid/raw',
          'accountSummary': {
            'tierName': 'Paper',
            'tierLevel': 0,
            'anlasBalance': 42,
            'hasActiveSubscription': false
          }
        }
      ]
    };
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late PathProviderPlatform paths;
  late NovelAiAccounts accounts;
  late _VerifiedStorage storage;
  late String? document;
  bool failWrite = false;
  setUp(() async {
    root =
        Directory.systemTemp.createTempSync('owned-account-vault-transaction-');
    paths = PathProviderPlatform.instance;
    PathProviderPlatform.instance = _Paths(root.path);
    UnifiedStorage.active = null;
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    document = null;
    failWrite = false;
    accounts = NovelAiAccounts(
        read: () async => document,
        write: (value) async {
          if (failWrite) throw StateError('fixture vault write failed');
          document = value;
        });
    await accounts.load(
        legacyToken: () async => null,
        legacySettings: () async => AppSettings());
    storage = _VerifiedStorage(accounts);
    await storage.setSettings(AppSettings(imageOutputDir: root.path));
  });
  tearDown(() async {
    PathProviderPlatform.instance = paths;
    if (root.parent.path != Directory.systemTemp.path ||
        !root.path
            .split(Platform.pathSeparator)
            .last
            .startsWith('owned-account-vault-transaction-')) {
      throw StateError('Unsafe owned cleanup');
    }
    await root.delete(recursive: true);
  });
  Future<File> archive(Object? value,
      {Map<String, dynamic> settings = const {}}) async {
    final zip = Archive();
    void add(String name, Object value) {
      final bytes = utf8.encode(jsonEncode(value));
      zip.addFile(ArchiveFile(name, bytes.length, bytes));
    }

    add('manifest.json', {
      'format': 'langbai-novelai-studio-backup',
      'version': 1,
      'categories': ['apiCredentials']
    });
    add('data/api-credentials.json',
        {'novelAiAccounts': value, 'token': '', 'settings': settings});
    return File('${root.path}/incoming.naisbackup')
      ..writeAsBytesSync(ZipEncoder().encode(zip)!);
  }

  Future<void> restore(String path) async {
    await DataBackupService(storage).importBackup(
        path, {DataBackupCategory.apiCredentials},
        confirmConfigurationOverwrite: true);
  }

  Future<NovelAiAccount> existing() => accounts.addVerified(
      label: 'Existing relay',
      method: 'relay',
      token: 'fixture-relay-existing',
      apiBaseUrl: 'https://relay.example.invalid/prefix',
      imageBaseUrl: 'https://images.example.invalid/raw',
      verify: (_) async =>
          const AccountSummary(hasToken: true, anlasBalance: 19));
  test(
      'public actual ZIP import validates all methods then restores cached balance, binding and repeat dedup',
      () async {
    final file = await archive(portable());
    await restore(file.path);
    expect(accounts.profiles.length, 3);
    expect(accounts.active?.profile.id, 'relay');
    expect(accounts.cachedSummary('relay').anlasBalance, 42);
    expect(accounts.cachedSummary('relay').hasActiveSubscription, false);
    expect(storage.requests.length, 5);
    storage.requests.clear();
    await restore(file.path);
    expect(accounts.profiles.length, 3);
    expect(storage.requests.length, 5);
    final reopened = NovelAiAccounts(
        read: () async => document,
        write: (_) async => throw StateError('Read-only reopening'));
    await reopened.load(
        legacyToken: () async => null,
        legacySettings: () async => AppSettings());
    expect(reopened.active?.profile.method, 'relay');
    expect(reopened.cachedSummary('relay').anlasBalance, 42);
    expect(reopened.cachedSummary('relay').stale, true);
  });
  test(
      'failed second authentication stops whole public import before saved accounts and other API settings change',
      () async {
    final old = await existing(),
        before = document,
        settings = jsonEncode((await storage.getSettings()).toJson());
    storage.failedRequest = 2;
    final input = await archive(portable(),
        settings: {'visionApiKey': 'fixture-incoming-other-key'});
    await expectLater(restore(input.path), throwsFormatException);
    expect(document == before, true);
    expect(accounts.active?.profile.id, old.id);
    expect(accounts.profiles.length, 1);
    expect(
        jsonEncode((await storage.getSettings()).toJson()) == settings, true);
    expect(storage.requests.length, 2);
  });
  test(
      'bad IDs, binding, unknown secret fields, bounds and cross origin routing reject before network',
      () async {
    final p = portable(), rows = p['accounts'] as List;
    final bad = [
      {...p, 'selectedId': 'missing'},
      {
        ...p,
        'accounts': [rows[0], rows[0]]
      },
      {...p, 'password': 'forbidden'},
      {
        ...p,
        'accounts': [
          {...rows[2] as Map, 'imageBaseUrl': 'https://image.novelai.net'}
        ]
      },
      {
        ...p,
        'accounts': [
          {
            ...rows[0] as Map,
            'accountSummary': {'token': 'forbidden'}
          }
        ]
      },
      {
        ...p,
        'accounts': List.generate(129, (i) => {...rows[0] as Map, 'id': 'id$i'})
      }
    ];
    for (final value in bad) {
      final before = document;
      await expectLater(
          restore((await archive(value)).path), throwsFormatException);
      expect(document == before, true);
      expect(storage.requests, isEmpty);
    }
  });
  test(
      'secure vault write failure cannot commit a partially imported account or change selection',
      () async {
    final old = await existing(), before = document;
    failWrite = true;
    await expectLater(
        restore((await archive(portable())).path), throwsStateError);
    expect(document == before, true);
    expect(accounts.profiles.length, 1);
    expect(accounts.active?.profile.id, old.id);
  });
  test(
      'concurrent account save wins and invalidates a staged restore without partial overwrite',
      () async {
    storage.duringFirstRead = () async {
      await existing();
    };
    await expectLater(
        restore((await archive(portable())).path), throwsStateError);
    expect(accounts.profiles.length, 1);
    expect(accounts.active?.profile.label, 'Existing relay');
  });
  test(
      'source id collision remaps imported selection instead of overwriting unrelated saved key',
      () async {
    final old = await existing(), p = portable();
    (p['accounts'] as List)[2]['id'] = old.id;
    p['selectedId'] = old.id;
    await restore((await archive(p)).path);
    expect(accounts.profiles.length, 4);
    expect(accounts.profiles.firstWhere((a) => a.id == old.id).label,
        'Existing relay');
    expect(accounts.active?.profile.label, 'selected relay');
  });
  test(
      'empty portable backup preserves saved relay and configuration-only excludes credential document',
      () async {
    final old = await existing(), before = document;
    await restore(
        (await archive({'version': 1, 'selectedId': null, 'accounts': []}))
            .path);
    expect(document == before, true);
    expect(accounts.active?.profile.id, old.id);
    final out = await DataBackupService(storage)
            .createBackup({DataBackupCategory.configuration}, internal: true),
        zip = ZipDecoder().decodeBytes(await out.readAsBytes());
    expect(zip.findFile('data/api-credentials.json'), isNull);
    final entry = zip.findFile('data/configuration.json')!;
    expect(
        RegExp('novelAiAccounts|fixture-relay|encryptedToken')
            .hasMatch(utf8.decode(entry.content as List<int>)),
        false);
  });
  test(
      'same main endpoint and Token deduplicate across image endpoints and labels',
      () async {
    final p = portable(), rows = p['accounts'] as List;
    rows.add(<String, Object>{
      ...rows[2] as Map,
      'id': 'relay-alias',
      'label': 'alias',
      'apiBaseUrl': 'https://RELAY.example.invalid:443/prefix/',
      'imageBaseUrl': 'https://other-images.example.invalid/raw'
    });
    p['selectedId'] = 'relay-alias';
    await restore((await archive(p)).path);
    expect(accounts.profiles.length, 3);
    expect(accounts.active?.profile.id, 'relay');
  });
  test(
      'portable cached expiry survives shared secure-storage reopen and re-export',
      () async {
    final p = portable();
    (p['accounts'] as List)[2]['accountSummary']['expiresAt'] = '2026-12-31';
    await restore((await archive(p)).path);
    final reloaded = NovelAiAccounts(
        read: () async => document,
        write: (_) async => throw StateError('Read-only reopen'));
    await reloaded.load(
        legacyToken: () async => null,
        legacySettings: () async => AppSettings());
    expect(reloaded.cachedSummary('relay').expiresAt, '2026-12-31');
    expect(
        (reloaded.exportBackup()['accounts'] as List)
                .firstWhere((a) => a['id'] == 'relay')['accountSummary']
            ['expiresAt'],
        '2026-12-31');
  });
  test(
      'actual desktop archive imports on shared storage and actual shared ZIP returns same account metadata',
      () async {
    const dir = String.fromEnvironment('ACCOUNT_VAULT_INTEROP');
    if (dir.isEmpty) return;
    await restore('$dir/desktop.naisbackup');
    expect(accounts.profiles.map((a) => a.method).toList()..sort(),
        ['official-login', 'relay', 'token']);
    expect(accounts.active?.profile.imageBaseUrl,
        'https://images.example.invalid/raw');
    expect(
        accounts.cachedSummary(accounts.active!.profile.id).anlasBalance, 42);
    final out = await DataBackupService(storage)
        .createBackup({DataBackupCategory.apiCredentials}, internal: true);
    await File(out.path).copy('$dir/mobile.naisbackup');
  });
}
