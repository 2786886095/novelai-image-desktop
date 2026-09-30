import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/studio_generation_preparations.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _LegacyTokenStorage extends Storage {
  String? token;
  _LegacyTokenStorage(this.token);
  @override
  Future<String?> getToken() async => token;
}

Future<NovelAiAccounts> _emptyVault() async {
  final vault = NovelAiAccounts(
    read: () async => null, write: (_) async {});
  await vault.load(legacyToken: () async => null,
    legacySettings: () async => AppSettings());
  return vault;
}

void main() {
  test('preparation belongs to one chat, freezes arguments and is consumed once', () {
    final plans = StudioGenerationPreparations();
    final args = <String, dynamic>{'positivePrompt': '1girl, rain', 'count': 1};
    final prepared = plans.prepare('chat-a', args, 'settings-a',
      {'estimatedAnlas': 22, 'estimateSource': 'local-estimate'});
    args['positivePrompt'] = 'changed';
    final id = prepared['preparationId'];
    expect(() => plans.inspect('chat-b', id, 'settings-a'), throwsStateError);
    expect(plans.consume('chat-a', id, 'settings-a')['positivePrompt'], '1girl, rain');
    expect(() => plans.consume('chat-a', id, 'settings-a'), throwsStateError);
  });

  test('settings drift and expiry prevent paid execution', () {
    var now = DateTime.utc(2026, 9, 30);
    final plans = StudioGenerationPreparations(now: () => now);
    final prepared = plans.prepare('chat', {'positivePrompt': 'cat'},
      'old', {'estimatedAnlas': null});
    expect(() => plans.consume('chat', prepared['preparationId'], 'new'),
      throwsStateError);
    now = now.add(const Duration(minutes: 10));
    expect(() => plans.consume('chat', prepared['preparationId'], 'old'),
      throwsStateError);
  });

  test('empty prompt and oversized arguments are not prepared', () {
    final plans = StudioGenerationPreparations();
    expect(() => plans.prepare('chat', {'positivePrompt': ''}, 'settings', {}),
      throwsStateError);
    expect(() => plans.prepare('chat', {'positivePrompt': 'x' * 20001},
      'settings', {}), throwsStateError);
  });

  test('same settings and tier cannot reuse preparation after official A to B', () async {
    final vault = await _emptyVault();
    final a = await vault.add(label: 'A', method: 'token', token: 'fixture-secret-A');
    final b = await vault.add(label: 'B', method: 'token', token: 'fixture-secret-B');
    await vault.activate(a.id);
    final app = AppState(storage: NovelAiAccountStorage(vault));
    addTearDown(app.dispose);
    app.account = const AccountSummary(hasToken: true, tierLevel: 3,
      hasActiveSubscription: true, anlasBalance: 1000);
    final before = await studioGenerationFingerprint(app);
    final plans = StudioGenerationPreparations();
    final prepared = plans.prepare('chat', {'positivePrompt': 'cat'}, before,
      studioGenerationPreview(app, {'positivePrompt': 'cat'}));
    await app.activateNaiAccount(b.id);
    app.account = const AccountSummary(hasToken: true, tierLevel: 3,
      hasActiveSubscription: true, anlasBalance: 1000);
    final after = await studioGenerationFingerprint(app);
    expect(after, isNot(before));
    expect(() => plans.consume('chat', prepared['preparationId'], after), throwsStateError);
    expect(before, isNot(contains('fixture-secret-A')));
    expect(before, matches(RegExp(r'^[a-f0-9]{64}$')));
    expect(prepared.toString(), isNot(contains('fixture-secret-A')));
  });

  test('same account id with rotated credential and legacy token drift invalidate', () async {
    final app = AppState(storage: _LegacyTokenStorage('fixture-legacy-A'));
    addTearDown(app.dispose);
    final before = await studioGenerationFingerprint(app);
    (app.storage as _LegacyTokenStorage).token = 'fixture-legacy-B';
    expect(await studioGenerationFingerprint(app), isNot(before));

    Future<String> vaultedFingerprint(String token) async {
      final vault = NovelAiAccounts(read: () async =>
        '{"version":1,"activeId":"fixed-id","accounts":[{"id":"fixed-id",'
        '"label":"A","method":"token","apiBaseUrl":"https://api.novelai.net",'
        '"imageBaseUrl":"https://image.novelai.net","token":"$token"}]}',
        write: (_) async {});
      final state = AppState(storage: NovelAiAccountStorage(vault));
      try { return await studioGenerationFingerprint(state); }
      finally { state.dispose(); }
    }
    expect(await vaultedFingerprint('fixture-rotated-A'),
      isNot(await vaultedFingerprint('fixture-rotated-B')));
  });

  test('relay preview does not use official Anlas balance or pricing', () async {
    final vault = await _emptyVault();
    final relay = await vault.add(label: 'Relay', method: 'relay',
      token: 'fixture-relay-secret', apiBaseUrl: 'https://relay.example/api',
      imageBaseUrl: 'https://relay.example/image');
    await vault.activate(relay.id);
    final app = AppState(storage: NovelAiAccountStorage(vault));
    addTearDown(app.dispose);
    app.account = const AccountSummary(hasToken: true, tierLevel: 3,
      hasActiveSubscription: true, anlasBalance: 999999);
    final preview = studioGenerationPreview(app, {'positivePrompt': 'cat'});
    expect(preview['estimatedAnlas'], isNull);
    expect(preview['estimateSource'], 'provider-unknown');
    expect(preview['warning'], contains('第三方中转'));
    expect(preview.toString(), isNot(contains('999999')));
    expect(preview.toString(), isNot(contains('fixture-relay-secret')));
    final bound = await studioGenerationFingerprint(app);
    app.settings.imageBaseUrl = 'https://different.example/image';
    expect(await studioGenerationFingerprint(app), isNot(bound));
  });
}
