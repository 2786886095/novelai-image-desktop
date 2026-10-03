import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _BackupPaths extends PathProviderPlatform {
  final String root;
  _BackupPaths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

// Only non-empty network cases use a controlled transport. Account validation,
// verify-before-commit and dedup are the production implementations.
class _ReadOnlyVerifiedStorage extends NovelAiAccountStorage {
  final int status;
  final calls = <http.Request>[];
  _ReadOnlyVerifiedStorage(super.accounts, this.status);
  @override
  Future<void> setToken(String token) async {
    await ready();
    final api = NovelAiAccountApi(accounts,
        clientFactory: (_, __) => MockClient((request) async {
              calls.add(request);
              expect(request.method, 'GET');
              expect(request.url.host, 'image.novelai.net');
              expect(request.url.path, '/user/data');
              return http.Response(jsonEncode({
                'subscription': {
                  'tier': 0,
                  'trainingStepsLeft': {
                    'fixedTrainingStepsLeft': 100,
                    'purchasedTrainingSteps': 7
                  }
                }
              }), status);
            }));
    await accounts.addVerified(
        label: accounts.nextLabel,
        method: 'token',
        token: token,
        verify: (snapshot) => api.verifyCandidate(snapshot, AppSettings()));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late NovelAiAccounts accounts;
  late NovelAiAccountStorage storage;
  late String? document;
  late PathProviderPlatform previousPaths;
  const inputPath = String.fromEnvironment('NATIVE_EMPTY_TOKEN_BACKUP',
      defaultValue: 'test/fixtures/native_empty_api_token.naisbackup');

  setUp(() async {
    root = Directory.systemTemp.createTempSync('native-empty-token-');
    previousPaths = PathProviderPlatform.instance;
    PathProviderPlatform.instance = _BackupPaths(root.path);
    UnifiedStorage.active = null;
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    document = null;
    accounts = NovelAiAccounts(
        read: () async => document, write: (value) async => document = value);
    await accounts.load(
        legacyToken: () async => null,
        legacySettings: () async => AppSettings());
    storage = NovelAiAccountStorage(accounts);
    await storage.setSettings(AppSettings(imageOutputDir: root.path));
  });

  tearDown(() {
    PathProviderPlatform.instance = previousPaths;
    if (root.existsSync() &&
        root.parent.path == Directory.systemTemp.path &&
        root.path.split(Platform.pathSeparator).last.startsWith('native-empty-token-')) {
      root.deleteSync(recursive: true);
    }
  });

  Future<NovelAiAccount> existing() async {
    final account = await accounts.addVerified(
        label: 'Existing relay', method: 'relay', token: 'FIXTURE-EXISTING',
        apiBaseUrl: 'https://relay.example.test/prefix',
        imageBaseUrl: 'https://relay.example.test/prefix',
        verify: (_) async => const AccountSummary(
            hasToken: true, anlasBalance: 19, tierName: 'Paper', tierLevel: 0));
    return account;
  }

  Future<File> input({String? token, bool omitToken = false}) async {
    final archive = ZipDecoder().decodeBytes(await File(inputPath).readAsBytes());
    final api = jsonDecode(utf8.decode(archive.findFile('data/api-credentials.json')!.content as List<int>)) as Map<String, dynamic>;
    expect(api['token'], '');
    expect(api['account'], isNull);
    if (omitToken) {
      api.remove('token');
    } else if (token != null) {
      api['token'] = token;
    }
    if (token != null || omitToken) {
      archive.removeFile(archive.findFile('data/api-credentials.json')!);
      final bytes = utf8.encode(jsonEncode(api));
      archive.addFile(ArchiveFile('data/api-credentials.json', bytes.length, bytes));
    }
    return File('${root.path}/input.naisbackup')
      ..writeAsBytesSync(token == null && !omitToken
          ? await File(inputPath).readAsBytes()
          : ZipEncoder().encode(archive)!);
  }

  Future<DataBackupImportReport> restore(File file) =>
      DataBackupService(storage).importBackup(file.path,
          {DataBackupCategory.apiCredentials}, confirmConfigurationOverwrite: true);

  test('actual native empty-token archive restores logged-out API settings', () async {
    final file = await input();
    final before = document;
    final report = await restore(file);
    expect(report.imported, greaterThan(0));
    expect(File(report.rescueBackupPath).existsSync(), true);
    expect(accounts.active, isNull);
    expect(accounts.profiles, isEmpty);
    expect(document, before);
    // Repeating a logged-out archive must not create an empty account either.
    await restore(file);
    expect(document, before);
  });

  test('empty token preserves inactive saved accounts', () async {
    final account = await existing();
    await accounts.activate(null);
    final before = document;
    await restore(await input());
    expect(document, before);
    expect(accounts.profiles.single.id, account.id);
    expect(accounts.active, isNull);
  });

  test('empty token preserves active relay identity endpoint and cached balance', () async {
    final account = await existing();
    final before = document;
    await restore(await input());
    expect(document, before);
    expect(accounts.active!.profile.id, account.id);
    expect(accounts.active!.profile.method, 'relay');
    expect(accounts.active!.profile.apiBaseUrl, 'https://relay.example.test/prefix');
    expect(accounts.cachedSummary(account.id).anlasBalance, 19);
  });

  test('whitespace-only token is missing data not an invalid new account', () async {
    await existing();
    final before = document;
    await restore(await input(token: ' \t '));
    expect(document, before);
  });

  test('legacy archive without token preserves the account vault', () async {
    await existing();
    final before = document;
    await restore(await input(omitToken: true));
    expect(document, before);
  });

  test('malformed nonempty token still fails real account validation without save', () async {
    await existing();
    final before = document;
    await expectLater(restore(await input(token: 'FIXTURE\nINVALID')), throwsFormatException);
    expect(document, before);
    expect(accounts.profiles.length, 1);
  });

  test('nonempty authentication failure does not save or clear current account', () async {
    await existing();
    final before = document;
    final verified = _ReadOnlyVerifiedStorage(accounts, 401);
    storage = verified;
    await expectLater(restore(await input(token: 'FIXTURE-NEW')), throwsFormatException);
    expect(verified.calls.length, 1);
    expect(document, before);
    expect(accounts.profiles.length, 1);
  });

  test('nonempty token still verifies before save and duplicate restore adds no account', () async {
    await existing();
    final verified = _ReadOnlyVerifiedStorage(accounts, 200);
    storage = verified;
    final file = await input(token: 'FIXTURE-NEW');
    await restore(file);
    final id = accounts.active!.profile.id;
    expect(accounts.profiles.length, 2);
    expect(accounts.cachedSummary(id).anlasBalance, 107);
    await restore(file);
    expect(verified.calls.length, 2);
    expect(accounts.profiles.length, 2);
    expect(accounts.active!.profile.id, id);
  });
}
