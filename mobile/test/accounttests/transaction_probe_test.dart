import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/state/app_state.dart';

/// Same deterministic, network-free behavioral input on original/modified/
/// restored source. Dynamic lookup intentionally allows the old source to run.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('transaction behavior probe: activate B, deny C while busy', () async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({'nai_token': 'fixture-A'});
    final dynamic app = AppState();
    addTearDown(() => (app as AppState).dispose());
    expect(await app.storage.getToken(), 'fixture-A');
    try {
      await app.addNaiAccount(
          label: 'Fixture B', method: 'token', token: 'fixture-B');
    } on NoSuchMethodError {
      expect(await app.storage.getToken(), 'fixture-A');
      // ignore: avoid_print
      print(
          'BEHAVIOR legacy-single-token: A retained; multi-account activation unavailable');
      return;
    }
    expect(await app.storage.getToken(), 'fixture-B');
    expect(
        await const FlutterSecureStorage().read(key: 'nai_token'), 'fixture-A');
    app.busy = true;
    await expectLater(
        app.addNaiAccount(
            label: 'Fixture C', method: 'token', token: 'fixture-C'),
        throwsStateError);
    expect(await app.storage.getToken(), 'fixture-B');
    // ignore: avoid_print
    print(
        'BEHAVIOR multi-account: B active; A preserved in OS vault; C rejected while busy');
  });
}
