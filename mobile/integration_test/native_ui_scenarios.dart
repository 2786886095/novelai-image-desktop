// Native accounts/random-artists/navigation slice. All nine checks require the
// real mobile engine, OS vault/preferences/files, production widgets and sockets.
// Host analyze/test is authoring validation only, never a native pass receipt.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/main.dart' show HomeShell;
import 'package:novelai_mobile/i18n/runtime_text.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/artist/custom_artist_pool.dart';
import 'package:novelai_mobile/inpaint/inpaint_mask.dart';
import 'package:novelai_mobile/screens/novelai_accounts_screen.dart';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/screens/tools_hub_screen.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/screens/v5_artist_weight_repair_screen.dart';
import 'package:novelai_mobile/screens/prompt_codex_screen.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';
import 'native_scenario_support.dart';
import 'native_ui_actions.dart';
import 'native_account_wait_diagnostic.dart';
import 'native_ui_tls_fixture.dart';

final suite = NativeScenarios(9);
Future<void> main() => suite.run(_run);
Future<void> _run() async {
  final c = await NativeContext.create('ui'),
      tls = await NativeUiTlsFixture.open(png(64, 64));
  try {
    await _accounts(c, tls);
    await _random(c, tls);
    await _navigation(c, tls);
    require(tls.errors.isEmpty, 'Native TLS fixture failed: ${tls.errors}');
    coverageGap('tools',
        'Not certified by mounting tool routes. Full six exposed tool outputs/error/cancel flows require separate operational scenarios.');
  } finally {
    await nativeUiMount(c.app, const SizedBox.shrink());
    await tls.close();
    await c.close();
  }
}

AppSettings _proxied(AppSettings base, NativeUiTlsFixture tls) =>
    AppSettings.fromJson(base.toJson())
      ..proxyMode = 'custom'
      ..proxyUrl = tls.proxyUrl
      ..proxyForNai = true
      ..proxyForAi = true
      ..proxyForUpdate = true
      ..proxyForTranslate = true
      ..proxyForMcp = true;
// Integration-fixture boot only. This is the production AppState.load path,
// not a booted flag override. Native storage remains the real OS implementation.
Future<void> loadNativeNavigation(AppState app, Storage storage) async {
  final proxy = Uri.tryParse(app.settings.proxyUrl);
  require(
      app.settings.proxyMode == 'custom' &&
          proxy?.scheme == 'http' &&
          proxy?.hasPort == true &&
          InternetAddress.tryParse(proxy!.host)?.isLoopback == true &&
          app.settings.proxyForNai && app.settings.proxyForAi &&
          app.settings.proxyForUpdate && app.settings.proxyForTranslate &&
          app.settings.proxyForMcp,
      'Navigation boot requires the closed loopback proxy for every scope');
  final proxyUrl = app.settings.proxyUrl;
  await storage.setSettings(app.settings);
  await storage.markNetworkOnboardingSeen();
  final token = await storage.getToken();
  require(token == null || token.isEmpty,
      'Navigation boot must not refresh a real or stale account credential');
  final expectedParams = await storage.getParams();
  final expectedHistory = await storage.getHistory();
  require(app.settings.persistGenerateParams,
      'Navigation fixture requires durable generation-parameter restoration');
  await app.load();
  require(app.status == runtimeTextFor(app.settings.language, 'common.ready') &&
      jsonEncode(app.params.toJson()) == jsonEncode(expectedParams.toJson()) &&
      jsonEncode(app.history.map((h) => h.toJson()).toList()) ==
          jsonEncode(expectedHistory.map((h) => h.toJson()).toList()),
      'Production navigation boot did not read durable parameters/history');
  require(app.booted && !app.needsNetworkOnboarding &&
      app.settings.proxyMode == 'custom' && app.settings.proxyUrl == proxyUrl &&
      app.settings.proxyForNai && app.settings.proxyForAi &&
      app.settings.proxyForUpdate && app.settings.proxyForTranslate &&
      app.settings.proxyForMcp,
      'Production navigation boot did not restore its isolated settings');
}

Future<void> _switchInSelector(AppState app, String label, String id) async {
  await nativeUiWait(() => !app.naiAccountLocked, 'account selector idle');
  final selector = nativeUiElements((w) => w is DropdownButton<String>);
  require(selector.length == 1, 'Expected actual production account selector');
  await nativeUiTap(selector.single);
  await nativeUiWait(
      () => nativeUiElements(
              (w) => w is Text && (w.data?.startsWith('$label ·') ?? false))
          .isNotEmpty,
      'account dropdown $label');
  await nativeUiTap(nativeUiElements(
      (w) => w is Text && (w.data?.startsWith('$label ·') ?? false)).last);
  final diagnostic=NativeAccountWaitDiagnostic(
    () => app.naiAccounts.active?.profile.id == id && !app.naiAccountLocked,
    () => NativeAccountWaitState(
    activeMatch:app.naiAccounts.active?.profile.id==id,
    locked:app.naiAccountLocked,
    apiInFlight:app.api is NovelAiAccountApi && (app.api as NovelAiAccountApi).inFlight,
    vaultLocked:app.naiAccounts.locked,busy:app.busy,
    queueRunning:app.generationQueueRunning,queueAdding:app.queueAdding));
  try {
    await nativeUiWait(diagnostic.selectedAndIdle,
        'account selected and read-only refresh finished');
    diagnostic.finish(success:true);
  } catch (_) {
    diagnostic.finish(success:false);
    rethrow;
  }
}

Future<void> _accounts(NativeContext c, NativeUiTlsFixture tls) async {
  const vault = FlutterSecureStorage();
  // NativeScenarios has already required an explicitly disposable device.
  await vault.delete(key: NovelAiAccounts.vaultKey);
  await Storage().clearToken();
  final accounts = NovelAiAccounts(),
      storage = NovelAiAccountStorage(accounts),
      api = NovelAiAccountApi(accounts);
  final app = AppState(api: api, storage: storage)
    ..settings = _proxied(c.app.settings, tls)
    ..params = c.app.params.copy();
  await storage.ready();
  try {
    await app.addNaiAccount(
        label: 'Native A',
        method: 'relay',
        token: NativeUiTlsFixture.tokenA,
        apiBaseUrl: NativeUiTlsFixture.a,
        imageBaseUrl: NativeUiTlsFixture.a);
    final a = accounts.active!.profile.id;
    await app.addNaiAccount(
        label: 'Native B',
        method: 'relay',
        token: NativeUiTlsFixture.tokenB,
        apiBaseUrl: NativeUiTlsFixture.b,
        imageBaseUrl: NativeUiTlsFixture.b);
    var b = accounts.active!.profile.id;
    require(a != b && accounts.profiles.length == 2,
        'Native verified create failed');
    await app.removeNaiAccount(b);
    require(accounts.profiles.length == 1, 'Native secure delete failed');
    await app.addNaiAccount(
        label: 'Native B',
        method: 'relay',
        token: NativeUiTlsFixture.tokenB,
        apiBaseUrl: NativeUiTlsFixture.b,
        imageBaseUrl: NativeUiTlsFixture.b);
    b = accounts.active!.profile.id;
    await app.addNaiAccount(
        label: 'Duplicate A',
        method: 'relay',
        token: NativeUiTlsFixture.tokenA,
        apiBaseUrl: NativeUiTlsFixture.a,
        imageBaseUrl: NativeUiTlsFixture.a);
    require(accounts.active!.profile.id == a && accounts.profiles.length == 2,
        'Verified duplicate changed credential identity');
    tls.balance = 1234;
    await app.verifyNaiAccount(a);
    final reopened = NovelAiAccounts();
    await NovelAiAccountStorage(reopened).ready();
    require(
        reopened.profiles.length == 2 &&
            reopened.active?.profile.id == a &&
            reopened.reveal(a) == NativeUiTlsFixture.tokenA &&
            reopened.cachedSummary(a).anlasBalance == 1234,
        'Real OS vault reopen/summary update failed');
    final prefs = await SharedPreferences.getInstance();
    final plain =
        jsonEncode({for (final key in prefs.getKeys()) key: prefs.get(key)});
    require(
        !plain.contains(NativeUiTlsFixture.tokenA) &&
            !plain.contains(NativeUiTlsFixture.tokenB),
        'Token leaked to native plaintext preferences');
    await nativeUiMount(
        app, const Scaffold(body: NovelAiAccountSelector(showManage: false)));
    await _switchInSelector(app, 'Native B', b);
    await _switchInSelector(app, 'Native A', a);
    suite.check('accounts', 'secure-crud-switch', {
      'realNativeVaultCreateReadSummaryUpdateDelete': true,
      'duplicateCredentialDeduplicated': true,
      'actualProductionSelectorHitTestSwitchedBothAccounts': true,
      'plainPreferencesContainNoAccountSecrets': true,
      'savedAccountCount': 2
    });

    for (final entry in [
      (a, 'Native A', NativeUiTlsFixture.tokenA, 'relay-a.native.invalid'),
      (b, 'Native B', NativeUiTlsFixture.tokenB, 'relay-b.native.invalid')
    ]) {
      if (accounts.active!.profile.id != entry.$1) {
        await _switchInSelector(app, entry.$2, entry.$1);
      }
      final start = tls.requests.length;
      final result = await api.generate(
          entry.$3, app.settings, c.app.params.copy(), GenerateExtras());
      require(
          result.$1.length == 1 &&
              digest(result.$1.single) == digest(tls.image),
          'Account-bound actual HTTP ZIP generation mismatch');
      final calls =
          tls.requests.skip(start).where((r) => r['method'] == 'POST').toList();
      require(
          calls.length == 1 &&
              calls.single['host'] == entry.$4 &&
              calls.single['path'] == '/ai/generate-image' &&
              calls.single['authorizationSha256'] ==
                  digest(utf8.encode('Bearer ${entry.$3}')),
          'Generation credential/origin binding changed');
    }
    tls.mode = 'hold';
    final pending = app.verifyNaiAccount(b);
    await tls.heldArrived.future.timeout(const Duration(seconds: 8));
    final heldCount = tls.requests.length;
    await fails(() => app.activateNaiAccount(a),
        'Switched account during bound operation');
    await fails(() => app.removeNaiAccount(b),
        'Removed account during bound operation');
    require(tls.requests.length == heldCount,
        'Denied account mutation sent another request');
    await tls.releaseHeld();
    await pending;
    tls.mode = 'normal';
    suite.check('accounts', 'binding-after-switch', {
      'actualProductionHttpsZipGenerations': 2,
      'eachOriginAndAuthorizationDigestMatchedActiveAccount': true,
      'inFlightLeaseDeniedSwitchAndDelete': true,
      'deniedMutationAdditionalRequests': 0,
      'publicOrPaidRequests': 0
    });

    final before = await vault.read(key: NovelAiAccounts.vaultKey),
        start = tls.requests.length;
    for (final invalid in [
      () async => app.addNaiAccount(
          label: 'Bad newline',
          method: 'relay',
          token: 'bad\nsecret',
          apiBaseUrl: NativeUiTlsFixture.a,
          imageBaseUrl: NativeUiTlsFixture.a),
      () async => app.addNaiAccount(
          label: 'Bad login URL',
          method: 'relay',
          token: NativeUiTlsFixture.tokenA,
          apiBaseUrl: '${NativeUiTlsFixture.a}/login',
          imageBaseUrl: NativeUiTlsFixture.a),
      () async => accounts.operation((_) async => null,
          expectedToken: 'wrong stale token')
    ]) {
      await fails(invalid, 'Invalid account input accepted');
    }
    require(tls.requests.length == start,
        'Invalid account preflight sent a request');
    tls.mode = 'invalid';
    String message = '';
    try {
      await app.verifyNaiAccount(b);
    } catch (error) {
      message = '$error';
    }
    tls.mode = 'normal';
    require(
        message.contains('NAI_ACCOUNT_VALIDATION:auth:401') &&
            !message.contains(NativeUiTlsFixture.tokenB) &&
            !message.contains('DO_NOT_DISCLOSE'),
        'Credential-bearing server error leaked or validation did not reject');
    require(await vault.read(key: NovelAiAccounts.vaultKey) == before,
        'Failed validation changed native vault');
    suite.check('accounts', 'invalid-credential-errors-no-leak', {
      'invalidInputsNoHttp': true,
      'actualHttps401Rejected': true,
      'untrustedErrorBodyNotDisclosed': true,
      'vaultBytesUnchanged': true,
      'noEndpointFallbackOrRetry': tls.requests.length == start + 1
    });
  } finally {
    await nativeUiMount(c.app, const SizedBox.shrink());
    await nativeUiWait(() => !api.inFlight, 'account requests closed');
    app.dispose();
    await vault.delete(key: NovelAiAccounts.vaultKey);
    await Storage().clearToken();
  }
}

Future<void> _revealArtist(bool Function(Widget) predicate) async {
  for (var i = 0; i < 35; i++) {
    if (nativeUiElements(predicate).isNotEmpty) return;
    final roots = nativeUiElements((w) =>
        w is ListView &&
        w.key == const PageStorageKey<String>('random-artist-lab-scroll'));
    require(roots.length == 1, 'Actual artist scroll view missing');
    ScrollableState? state;
    void walk(Element e) {
      if (e is StatefulElement && e.state is ScrollableState) {
        state ??= e.state as ScrollableState;
        return;
      }
      e.visitChildren(walk);
    }

    roots.single.visitChildren(walk);
    require(state != null, 'Actual artist scroll position missing');
    final position = state!.position;
    position.jumpTo((position.pixels + 500)
        .clamp(position.minScrollExtent, position.maxScrollExtent));
    await frame();
  }
  throw StateError('Actual artist control did not become visible');
}

Future<void> _random(NativeContext c, NativeUiTlsFixture tls) async {
  final app = c.app, service = ArtistTagService();
  app.settings = _proxied(app.settings, tls);
  await c.storage.setSettings(app.settings);
  final pool = await service.popular(app.settings,
      limit: 5, force: true, includeCurated: false);
  require(
      pool.length == 2 &&
          pool.map((a) => a.id).toSet().length == 2 &&
          pool.every((a) => !a.deprecated && a.id > 0),
      'Actual network artist filter/dedup failed');
  final custom = parseCustomArtistPool(
      'artist:native_artist_a, native artist b, native_artist_a, <invalid>, artist:bad:tag');
  require(
      custom.map((a) => a.name).join(',') == 'native_artist_a,native_artist_b',
      'Custom artist pool validation/dedup changed');
  final recipes = drawArtistRecipes(
      pool: custom,
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
  require(
      recipes.length == 4 &&
          recipes.every((r) =>
              r.artists.isNotEmpty &&
              r.artists.length <= 2 &&
              r.artists.toSet().length == r.artists.length &&
              r.artists.every((a) => custom.any((c) => c.name == a)) &&
              r.prompt.contains('blue_book') &&
              r.prompt.contains('purple_book')),
      'Native production recipe constraints failed');
  require(
      jsonEncode(recipes.map((r) => r.toJson()).toList()) ==
          jsonEncode(drawArtistRecipes(
                  pool: custom,
                  count: 4,
                  minArtists: 1,
                  maxArtists: 2,
                  drawSeed: 913,
                  minArtistWeight: .2,
                  maxArtistWeight: .4,
                  customTagPool: 'blue_book, purple_book',
                  customTagModes: {
                    'blue_book': 'always',
                    'purple_book': 'random'
                  },
                  minRandomCustomTags: 1,
                  maxRandomCustomTags: 1)
              .map((r) => r.toJson())
              .toList()),
      'Fixed artist draw is not reproducible');
  suite.check('random-artists', 'filters-sampling', {
    'realHttpsArtistCatalogFilteredDeduped': true,
    'customPoolInvalidTokensRejected': true,
    'countMinMaxAlwaysRandomTagsAndSeedObserved': true,
    'sampleCount': recipes.length
  });

  final bytes = png(64, 64),
      temp = await c.storage
          .saveArtistLabTemporaryImage(bytes, app.params.copy(), 42),
      prefs = await SharedPreferences.getInstance();
  const prefix = 'artist_lab_random_v1_';
  await prefs.setString(
      '${prefix}results',
      jsonEncode([
        {
          'recipe': recipes.first.toJson(),
          'sequence': 1,
          'seed': 42,
          'status': 'done',
          'image': temp.toJson(),
          'error': null,
          'generationModel': app.params.model,
          'liked': false
        }
      ]));
  await prefs.setInt('${prefix}count', 2);
  await prefs.setInt('${prefix}minArtists', 1);
  await prefs.setInt('${prefix}maxArtists', 2);
  await prefs.setInt('${prefix}poolSize', 100);
  await prefs.setString(
      '${prefix}customArtists', 'native_artist_a, native_artist_b');
  await prefs.setBool('${prefix}useCustomArtists', true);
  await nativeUiMount(app, RandomArtistLabScreen(onBack: () {}));
  await _revealArtist((w) =>
      w is IconButton &&
      w.icon is Icon &&
      (w.icon as Icon).icon == Icons.favorite_border &&
      w.onPressed != null);
  await nativeUiTap(nativeUiElements((w) =>
      w is IconButton &&
      w.icon is Icon &&
      (w.icon as Icon).icon == Icons.favorite_border &&
      w.onPressed != null).last);
  await nativeUiWait(() => app.history.any((h) => h.feature == 'artist-lab'),
      'actual artist Favorite action committed native history');
  final saved = app.history.firstWhere((h) => h.feature == 'artist-lab');
  // History is committed before the widget finishes its sequential preferences
  // writes. Read back the real native preferences, not just the shared cache or
  // a fixed delay, before asserting that the Favorite action has persisted.
  List<dynamic> favorites = const [];
  final persistenceWait = Stopwatch()..start();
  const persistenceBudget = Duration(seconds: 10);
  for (var attempt = 0; attempt < 400; attempt++) {
    final remaining = persistenceBudget - persistenceWait.elapsed;
    if (remaining <= Duration.zero) break;
    await prefs.reload().timeout(remaining);
    favorites =
        jsonDecode(prefs.getString('${prefix}favorites') ?? '[]') as List;
    if (favorites.length == 1 &&
        favorites.single['liked'] == true &&
        favorites.single['image']['id'] == saved.id) {
      break;
    }
    await frame();
  }
  require(
      favorites.length == 1 &&
          favorites.single['liked'] == true &&
          favorites.single['image']['id'] == saved.id,
      'Actual artist favorite UI did not persist result');
  require(
      !await File(temp.filePath).exists() &&
          digest(await File(saved.filePath).readAsBytes()) == digest(bytes),
      'Favorite did not transfer original temporary bytes');
  final history = await Storage().getHistory(),
      groups = await Storage().getGroups();
  require(
      history.any((h) => h.id == saved.id) &&
          groups.any((g) => g.id == saved.groupId && g.name == '画风实验室-随机抽卡'),
      'Artist saved native library group did not reopen');
  await nativeUiMount(app, const SizedBox.shrink());
  await nativeUiMount(app, RandomArtistLabScreen(onBack: () {}));
  await nativeUiWait(
      () => nativeUiElements((w) => w is SegmentedButton<bool>).isNotEmpty,
      'artist favorite UI reopened');
  suite.check('random-artists', 'saved-library-groups', {
    'realNativeTemporaryFileFavoriteButtonHitTest': true,
    'savedImageHashMatchesOriginal': true,
    'temporaryRemovedOnlyAfterSave': true,
    'historyAndDedicatedGroupReopened': true,
    'screenRemountedWithNativeSavedSession': true
  });

  final before = prefs.getString('artist_lab_popular_pool_v2'),
      savedBefore = digest(await File(saved.filePath).readAsBytes());
  tls.mode = 'offline';
  final offline = await service.popular(app.settings,
      limit: 5, force: true, includeCurated: false);
  tls.mode = 'normal';
  require(
      offline.length == 2 &&
          prefs.getString('artist_lab_popular_pool_v2') == before,
      'Real offline failure destroyed artist cache');
  require(
      drawArtistRecipes(pool: [], count: 3, drawSeed: 2).isEmpty &&
          drawArtistRecipes(pool: custom, count: 0, drawSeed: 2).isEmpty,
      'Invalid artist draw produced a result');
  final normalized = drawArtistRecipes(
      pool: custom,
      count: 1,
      minArtists: 100,
      maxArtists: -2,
      drawSeed: 9,
      minArtistWeight: double.nan,
      maxArtistWeight: double.infinity);
  require(
      normalized.length == 1 &&
          !normalized.single.prompt.contains('NaN') &&
          !normalized.single.prompt.contains('Infinity'),
      'Invalid artist bounds escaped normalization');
  require(digest(await File(saved.filePath).readAsBytes()) == savedBefore,
      'Artist offline/invalid flow changed a favorite');
  suite.check('random-artists', 'invalid-offline', {
    'actualHttps503UsedNativeCache': true,
    'cacheBytesAndFavoriteImageUnchanged': true,
    'emptyPoolZeroCountNoOutput': true,
    'nonfiniteAndArtistBoundsNormalized': true,
    'generationRequests': 0
  });
}

Future<void> _navigateTo(int target) async {
  final shell = nativeUiElements((w) => w is StudioAdaptiveShell).single.widget
      as StudioAdaptiveShell;
  final primary = StudioAdaptiveShell.normalizeDestinationOrder(
          shell.destinationOrder, shell.destinations.length)
      .take(4)
      .toList();
  if (primary.contains(target)) {
    final bar = nativeUiElements((w) => w is NavigationBar).single;
    Element? label;
    void walk(Element e) {
      if (e.widget is Text &&
          (e.widget as Text).data == shell.destinations[target].label) {
        label = e;
      }
      e.visitChildren(walk);
    }

    bar.visitChildren(walk);
    require(label != null, 'Primary destination label missing');
    await nativeUiTap(label!);
  } else {
    await nativeUiTextTap(shell.moreLabel);
    await nativeUiTextTap(shell.destinations[target].label);
  }
  await nativeUiWait(
      () =>
          (nativeUiElements((w) => w is StudioAdaptiveShell).single.widget
                  as StudioAdaptiveShell)
              .selectedIndex ==
          target,
      'real route $target selected');
}

Future<void> _nativeBack() async {
  final back = nativeUiElements((w) =>
      w is BackButton ||
      (w is IconButton &&
          w.icon is Icon &&
          (w.icon as Icon).icon == Icons.arrow_back));
  require(back.isNotEmpty, 'Production route Back control missing');
  await nativeUiTap(back.first);
}

// A ListView retains its scroll offset and lazily disposes off-screen tiles.
// Its first currently mounted ListTile is not the first business tool. Reveal
// the production hub's real scroll position, then bind the unique Comic label.
Future<void> openNativeComicFromTools(AppState app) async {
  final hubs = nativeUiElements((widget) => widget is ToolsHubScreen);
  require(hubs.length == 1, 'Expected one current production tools hub');
  final hub = hubs.single;
  final comicTitle = mobileToolsHubTextFor(app.settings.language).comicTitle;
  require(comicTitle.trim().isNotEmpty, 'Production Comic tool label is empty');
  List<Element> descendants(bool Function(Element) predicate) {
    final result = <Element>[];
    void visit(Element element) {
      if (!nativeUiVisible(element)) return;
      if (predicate(element)) result.add(element);
      element.visitChildren(visit);
    }

    require(hub.mounted && nativeUiVisible(hub),
        'Production tools hub is no longer current');
    hub.visitChildren(visit);
    return result;
  }

  final scrollables = descendants((element) =>
          element is StatefulElement && element.state is ScrollableState)
      .map((element) => (element as StatefulElement).state as ScrollableState)
      .where((state) => state.position.axis == Axis.vertical)
      .toList();
  require(scrollables.length == 1,
      'Expected one production tools hub vertical scroll position');
  final position = scrollables.single.position;
  await nativeUiWait(() => position.hasContentDimensions,
      'production tools hub scroll layout');
  require(
      position.minScrollExtent.isFinite && position.maxScrollExtent.isFinite,
      'Production tools hub scroll bounds are invalid');
  String? targetTitle;
  String diagnostic() => jsonEncode({
        'kind': 'diagnostic',
        'expectedTitle': comicTitle,
        'targetTitle': targetTitle,
        'scrollOffset': position.hasPixels ? position.pixels : null,
        'minScrollExtent': position.minScrollExtent,
        'maxScrollExtent': position.maxScrollExtent,
        'mountedTitles': hub.mounted && nativeUiVisible(hub)
            ? descendants((element) => element.widget is ListTile)
                .map((element) => (element.widget as ListTile).title)
                .whereType<Text>()
                .map((text) => text.data)
                .toList()
            : <String>[],
        'currentRoutes': {
          'toolsHub':
              nativeUiElements((widget) => widget is ToolsHubScreen).length,
          'comic': nativeUiElements((widget) => widget is ComicScreen).length,
          'batch':
              nativeUiElements((widget) => widget is BatchRedrawScreen).length,
        },
      });
  try {
    position.jumpTo(position.minScrollExtent);
    await frame();

    List<Element> comicTiles() => descendants((element) {
          final widget = element.widget;
          return widget is ListTile &&
              widget.onTap != null &&
              widget.title is Text &&
              (widget.title as Text).data == comicTitle;
        });
    await nativeUiWait(() => comicTiles().isNotEmpty,
        'uniquely identified production Comic tool');
    final targets = comicTiles();
    require(targets.length == 1, 'Production Comic tool identity is ambiguous');
    targetTitle = ((targets.single.widget as ListTile).title as Text).data;
    require(targetTitle == comicTitle, 'Production Comic tool title changed');
    final labels = <Element>[];
    void findLabel(Element element) {
      if (element.widget is Text && (element.widget as Text).data == comicTitle) {
        labels.add(element);
      }
      element.visitChildren(findLabel);
    }

    targets.single.visitChildren(findLabel);
    require(labels.length == 1, 'Production Comic tool title is ambiguous');
    // These are bounded public-UI diagnostics, never acceptance/proof markers.
    // ignore: avoid_print
    print('FEATURE_NATIVE_COMIC_TARGET:before-pointer:${diagnostic()}');
    // Keep the native hit-test path. Never invoke ListTile.onTap directly.
    await nativeUiTap(labels.single);
    // ignore: avoid_print
    print('FEATURE_NATIVE_COMIC_TARGET:after-pointer:${diagnostic()}');
  } catch (error) {
    throw StateError('$error; Comic target: ${diagnostic()}');
  }
}

Future<void> _navigation(NativeContext c, NativeUiTlsFixture tls) async {
  final app = c.app;
  app.settings = _proxied(app.settings, tls)..reduceMotion = true;
  final bootRequests = tls.requests.length;
  await loadNativeNavigation(app, c.storage);
  require(!tls.requests.skip(bootRequests).any((r) => r['method'] == 'POST'),
      'Read-only navigation boot submitted an unexpected request');
  // load restores durable state. Apply these navigation drafts only afterward.
  app.params.model = 'nai-diffusion-5-full';
  final file = File('${c.root.path}/navigation-original.png');
  await file.writeAsBytes(png(64, 64));
  await app.setWorkbenchPath(file.path);
  app.params.positivePrompt = 'NATIVE_NAV_PROMPT';
  app.convertInput = 'NATIVE_NAV_CONVERT';
  app.reverseResult = 'NATIVE_NAV_REVERSE';
  app.inpaintPositivePrompt = 'NATIVE_NAV_INPAINT';
  app.setInpaintEditorData([
    InpaintStroke(
        brushCells: 4, points: [const Offset(.2, .3), const Offset(.4, .5)])
  ], false);
  final imageHash = digest(await file.readAsBytes());
  await nativeUiMount(app, const HomeShell(),
      shellKey: const ValueKey('native-navigation-a'));
  await nativeUiWait(
      () => nativeUiElements((w) => w is StudioAdaptiveShell).isNotEmpty,
      'actual HomeShell initialized');
  final count = (nativeUiElements((w) => w is StudioAdaptiveShell).single.widget
          as StudioAdaptiveShell)
      .destinations
      .length;
  require(count == 15, 'Uncovered new mobile navigation destination');
  final visited = <int>[];
  for (var index = 0; index < count; index++) {
    await _navigateTo(index);
    visited.add(index);
  }
  await _navigateTo(6);
  final toolTitles = nativeUiElements(
          (w) => w is ListTile && w.onTap != null && w.title is Text)
      .map((e) => ((e.widget as ListTile).title as Text).data!)
      .toList();
  require(toolTitles.length == 6, 'Uncovered new nested tool route');
  final nested = <String>[];
  for (var index = 0; index < toolTitles.length; index++) {
    await nativeUiTextTap(toolTitles[index]);
    final bool Function(Widget) expected = switch (index) {
      0 => (w) => w is ComicScreen,
      1 => (w) => w is BatchRedrawScreen,
      2 => (w) => w is RandomArtistLabScreen,
      3 => (w) =>
          w is V5ArtistWeightRepairScreen && w.mode == V5ArtistToolMode.repair,
      4 => (w) =>
          w is V5ArtistWeightRepairScreen && w.mode == V5ArtistToolMode.draw,
      _ => (w) => w is PromptCodexScreen
    };
    await nativeUiWait(() => nativeUiElements(expected).isNotEmpty,
        'actual nested route ${toolTitles[index]}');
    nested.add(toolTitles[index]);
    await _nativeBack();
    await nativeUiWait(
        () => nativeUiElements((w) => w is ToolsHubScreen).isNotEmpty,
        'actual tools route returned');
  }
  suite.check('navigation', 'all-platform-routes', {
    'allProductionHomeShellDestinationsHitTestClicked': visited,
    'destinationCount': count,
    'nestedToolRoutesAndBackControlsHitTestClicked': nested,
    'actualNativeEngineNarrowPhoneLayout': true,
    'noReplacementPageImplementations': true,
    'toolOutputCertificationClaimed': false
  });
  await _navigateTo(6);
  require(nativeUiElements((w) => w is ToolsHubScreen).isNotEmpty,
      'Actual tools hub route missing');
  final tiles = nativeUiElements((w) => w is ListTile && w.onTap != null);
  require(tiles.isNotEmpty, 'Actual tool route links missing');
  await openNativeComicFromTools(app);
  await nativeUiWait(() => nativeUiElements((w) => w is ComicScreen).isNotEmpty,
      'actual comic nested route');
  await _nativeBack();
  await frame();
  await frame();
  await _navigateTo(1);
  await _navigateTo(0);
  require(
      app.params.positivePrompt == 'NATIVE_NAV_PROMPT' &&
          app.convertInput == 'NATIVE_NAV_CONVERT' &&
          app.reverseResult == 'NATIVE_NAV_REVERSE' &&
          app.inpaintPositivePrompt == 'NATIVE_NAV_INPAINT' &&
          app.workbenchImage?.filePath == file.path &&
          app.inpaintEditorStrokes.length == 1 &&
          app.inpaintEditorStrokes.single.points.length == 2 &&
          digest(await file.readAsBytes()) == imageHash,
      'Navigation/back lost editor state or source bytes');
  suite.check('navigation', 'return-edit-no-lost-state', {
    'actualNestedToolRoutePoppedAndReturned': true,
    'allPromptDraftsAndWorkbenchPreserved': true,
    'inpaintStrokePointsPreserved': true,
    'sourceImageHashUnchanged': true
  });

  final shell = nativeUiElements((w) => w is StudioAdaptiveShell).single.widget
      as StudioAdaptiveShell;
  final order = StudioAdaptiveShell.normalizeDestinationOrder(
          shell.destinationOrder, count),
      first = order[0],
      third = order[2];
  await nativeUiTextTap(shell.moreLabel);
  await nativeUiTextTap('Reorder navigation');
  await nativeUiWait(
      () =>
          nativeUiElements((w) => w.key == ValueKey('navigation-order-$first'))
              .isNotEmpty,
      'actual reorder list');
  final firstRow =
          nativeUiElements((w) => w.key == ValueKey('navigation-order-$first'))
              .single,
      thirdRow =
          nativeUiElements((w) => w.key == ValueKey('navigation-order-$third'))
              .single;
  Element? handle;
  void find(Element e) {
    if (e.widget is ReorderableDragStartListener) handle = e;
    e.visitChildren(find);
  }

  firstRow.visitChildren(find);
  require(handle != null, 'Actual production drag handle missing');
  await nativeUiDrag(handle!, thirdRow);
  await nativeUiTextTap('Save');
  final prefs = await SharedPreferences.getInstance();
  await nativeUiWait(
      () => prefs.getStringList('mobile_navigation_order_v1') != null,
      'native order commit');
  final saved = prefs.getStringList('mobile_navigation_order_v1')!;
  require(
      saved.length == count &&
          saved.toSet().length == count &&
          saved.join(',') != order.join(','),
      'Actual native reorder drag did not persist');
  await nativeUiMount(app, const SizedBox.shrink());
  await nativeUiMount(app, const HomeShell(),
      shellKey: const ValueKey('native-navigation-b'));
  await nativeUiWait(
      () => nativeUiElements(
              (w) => w is StudioAdaptiveShell && w.destinationOrder != null)
          .isNotEmpty,
      'native saved navigation cold widget rebuild');
  final restored = nativeUiElements((w) => w is StudioAdaptiveShell)
      .single
      .widget as StudioAdaptiveShell;
  require(
      restored.destinationOrder!.map((n) => '$n').join(',') == saved.join(','),
      'Native destination order did not reopen');
  require(
      nativeUiElements((w) => w.key == const ValueKey('studio-phone-shell'))
              .isNotEmpty &&
          nativeUiElements((w) => w is NavigationBar).length == 1,
      'Actual 360dp layout is not accessible phone navigation');
  await _navigateTo(int.parse(saved.first));
  suite.check('navigation', 'ordering-persist-narrow-window', {
    'actualReorderHandleGestureAndSave': true,
    'nativePreferenceOrderReopened': true,
    'everyDestinationExactlyOnce': true,
    'logicalViewportWidth': 360,
    'productionPhoneNavigationReachable': true,
    'savedOrder': saved
  });
}

// Diagnostic only: gaps remain explicit but never occupy the reserved Agent
// capability namespace, create CHECKs, or contribute acceptance coverage.
// ignore: avoid_print
void coverageGap(String feature, String reason) => print(
    'FEATURE_NATIVE_COVERAGE_GAP:${jsonEncode({'sourceSha':sourceSha,
      'profileSha':profileSha,'platform':Platform.operatingSystem,
      'testEntry':testEntry,'feature':feature,'status':'not-certified',
      'kind':'diagnostic','reason':reason,'paidCalls':0})}');
