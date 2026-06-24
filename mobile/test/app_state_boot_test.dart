import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/tags/offline_tag_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('saved token network failure never traps the app on the boot screen',
      () async {
    final state = _BootState(
      api: _OfflineApi(),
      storage: _BootStorage(),
      offlineTags: _OfflineTags(),
    );

    await state.load();

    // Boot must complete without ever awaiting the network: a saved token plus
    // an offline API must not trap the app on the loading spinner. The account
    // fetch is deferred off the boot path, so booted + a token placeholder are
    // available immediately.
    expect(state.booted, isTrue);
    expect(state.account.hasToken, isTrue, reason: state.status);

    // The deferred account refresh fails and surfaces a non-fatal status note;
    // wait for it to land (it runs after load() returns).
    for (var i = 0;
        i < 200 && !state.status.contains('账号信息暂时无法读取');
        i++) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    expect(state.status, contains('账号信息暂时无法读取'));
  });
}

class _BootState extends AppState {
  _BootState({
    required super.api,
    required super.storage,
    required super.offlineTags,
  });

  @override
  Future<void> checkUpdate({bool manual = false}) async {}
}

class _OfflineApi extends NaiApi {
  @override
  Future<AccountSummary> fetchAccount(
    String token,
    AppSettings settings,
  ) =>
      throw Exception('proxy unavailable');
}

class _BootStorage extends Storage {
  AppSettings settings = AppSettings(proxyMode: 'direct');

  @override
  Future<AppSettings> getSettings() async => settings;

  @override
  Future<void> setSettings(AppSettings value) async => settings = value;

  @override
  Future<GenerateParams> getParams() async => GenerateParams();

  @override
  Future<List<HistoryItem>> getHistory() async => [];

  @override
  Future<void> writeHistory(List<HistoryItem> items) async {}

  @override
  Future<List<HistoryGroup>> getGroups() async => [];

  @override
  Future<bool> hasSeenNetworkOnboarding() async => true;

  @override
  Future<String?> getToken() async => 'saved-token';
}

class _OfflineTags extends OfflineTagStore {
  @override
  Future<OfflineTagStatus> status() async => const OfflineTagStatus();
}
