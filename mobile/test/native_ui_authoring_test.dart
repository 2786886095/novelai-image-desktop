// Host authoring checks only: these DO NOT emit native acceptance receipts.
// No mocked HTTP, storage, platform channel or certificate-bypass callback.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/artist/custom_artist_pool.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import '../integration_test/native_ui_tls_fixture.dart';

void main() {
  test(
      'authoring: production account verifier uses real trusted TLS through loopback proxy, without a vault read',
      () async {
    final tls = await NativeUiTlsFixture.open(Uint8List.fromList([1, 2, 3]));
    final api = NovelAiAccountApi(NovelAiAccounts()),
        settings = AppSettings(
            proxyMode: 'custom', proxyUrl: tls.proxyUrl, proxyForNai: true);
    const snapshot = NovelAiCredentialSnapshot(
        NovelAiAccount(
            id: 'native-authoring',
            label: 'Synthetic',
            method: 'relay',
            apiBaseUrl: NativeUiTlsFixture.a,
            imageBaseUrl: NativeUiTlsFixture.a),
        NativeUiTlsFixture.tokenA);
    try {
      final result = await api.verifyCandidate(snapshot, settings);
      expect(result.hasToken, true);
      expect(result.stale, false);
      expect(result.anlasBalance, 1000);
      expect(tls.requests.single['host'], 'relay-a.native.invalid');
      expect(tls.requests.single['method'], 'GET');
      expect(
          tls.requests.single['authorizationSha256'],
          sha256
              .convert(utf8.encode('Bearer ${NativeUiTlsFixture.tokenA}'))
              .toString());
      expect(tls.errors, isEmpty);
      expect(tls.blockedAuthorities, isEmpty);
    } finally {
      await tls.close();
    }
  });
  test(
      'authoring: actual verifier never discloses the fixture credential echoed by HTTP401',
      () async {
    final tls = await NativeUiTlsFixture.open(Uint8List.fromList([1, 2, 3]));
    tls.mode = 'invalid';
    final api = NovelAiAccountApi(NovelAiAccounts()),
        settings = AppSettings(
            proxyMode: 'custom', proxyUrl: tls.proxyUrl, proxyForNai: true);
    const snapshot = NovelAiCredentialSnapshot(
        NovelAiAccount(
            id: 'native-authoring',
            label: 'Synthetic',
            method: 'relay',
            apiBaseUrl: NativeUiTlsFixture.b,
            imageBaseUrl: NativeUiTlsFixture.b),
        NativeUiTlsFixture.tokenB);
    try {
      String message = '';
      try {
        await api.verifyCandidate(snapshot, settings);
      } catch (error) {
        message = '$error';
      }
      expect(message, contains('NAI_ACCOUNT_VALIDATION:auth:401'));
      expect(message, isNot(contains(NativeUiTlsFixture.tokenB)));
      expect(message, isNot(contains('DO_NOT_DISCLOSE')));
      expect(tls.requests, hasLength(1));
      expect(tls.errors, isEmpty);
    } finally {
      await tls.close();
    }
  });
  test(
      'authoring: real recipe parser/draw handles fixture filters, invalid bounds and deterministic output',
      () {
    final pool = parseCustomArtistPool(
        'artist:native_artist_a, native artist b, native_artist_a, <invalid>, artist:bad:tag');
    expect(pool.map((r) => r.name), ['native_artist_a', 'native_artist_b']);
    List<ArtistRecipe> draw() => drawArtistRecipes(
        pool: pool,
        count: 4,
        minArtists: 1,
        maxArtists: 2,
        drawSeed: 913,
        minArtistWeight: .2,
        maxArtistWeight: .4,
        customTagPool: 'blue_book, purple_book',
        customTagModes: {'blue_book': 'always', 'purple_book': 'random'},
        minRandomCustomTags: 1,
        maxRandomCustomTags: 1);
    final output = draw();
    expect(output, hasLength(4));
    expect(
        output.every((r) =>
            r.prompt.contains('blue_book') && r.prompt.contains('purple_book')),
        true);
    expect(jsonEncode(output.map((r) => r.toJson()).toList()),
        jsonEncode(draw().map((r) => r.toJson()).toList()));
    final normalized = drawArtistRecipes(
        pool: pool,
        count: 1,
        minArtists: 100,
        maxArtists: -2,
        drawSeed: 9,
        minArtistWeight: double.nan,
        maxArtistWeight: double.infinity);
    expect(normalized, hasLength(1));
    expect(normalized.single.prompt, isNot(contains('NaN')));
    expect(normalized.single.prompt, isNot(contains('Infinity')));
  });
  test(
      'authoring: ui9 declares exactly the independent existing nine scenarios, never tools output certification',
      () {
    final source =
        File('integration_test/native_ui_scenarios.dart').readAsStringSync();
    final keys = RegExp(r"suite\.check\(\s*'([^']+)'\s*,\s*'([^']+)'")
        .allMatches(source)
        .map((m) => '${m[1]}/${m[2]}')
        .toList();
    expect(keys, [
      'accounts/secure-crud-switch',
      'accounts/binding-after-switch',
      'accounts/invalid-credential-errors-no-leak',
      'random-artists/filters-sampling',
      'random-artists/saved-library-groups',
      'random-artists/invalid-offline',
      'navigation/all-platform-routes',
      'navigation/return-edit-no-lost-state',
      'navigation/ordering-persist-narrow-window'
    ]);
    expect(source, contains("coverageGap('tools'"));
    expect(source, isNot(contains("suite.check('tools'")));
  });
}
