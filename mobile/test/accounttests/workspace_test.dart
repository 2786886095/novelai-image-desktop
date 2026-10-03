import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as im;
import 'package:provider/provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/novelai_accounts_screen.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/i18n/studio_agent_text.dart';
import 'accounts_test.dart' show memoryVault;

class DiskTestStorage extends NovelAiAccountStorage {
  final Directory root;
  Completer<void>? readGate;
  DiskTestStorage(super.accounts, this.root);
  @override
  Future<String?> getToken() async {
    await readGate?.future;
    return super.getToken();
  }

  @override
  Future<HistoryItem> saveArtistLabTemporaryImage(
      Uint8List bytes, GenerateParams params, int seed) async {
    final file = File('${root.path}/result.png');
    await file.writeAsBytes(bytes);
    return HistoryItem(
        id: 'generated',
        filePath: file.path,
        date: '2026-10-01',
        createdAt: '2026-10-01T00:00:00Z',
        seed: seed,
        model: params.model,
        width: params.width,
        height: params.height,
        prompt: params.positivePrompt);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
      'account manager localizes every login type and verification feedback at phone widths',
      (tester) async {
    for (final width in [320.0, 390.0]) {
      for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
        tester.view.physicalSize = Size(width, 844);
        tester.view.devicePixelRatio = 1;
        final vault = await memoryVault();
        final app = AppState(
            storage: NovelAiAccountStorage(vault),
            api: NovelAiAccountApi(vault))
          ..settings = AppSettings(language: language);
        String t(String key) => studioAgentText(language, key);
        await tester.pumpWidget(ChangeNotifierProvider.value(
            value: app,
            child: const MaterialApp(home: NovelAiAccountsScreen())));
        await tester.pumpAndSettle();
        expect(find.text(t('accountManager')), findsOneWidget);
        expect(find.text(t('accountManage')), findsNothing);
        for (final method in [
          'accountEmailShort',
          'accountRelayShort',
          'accountOfficialShort'
        ]) {
          await tester.ensureVisible(find.text(t(method)));
          await tester.tap(find.text(t(method)));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
        await tester.ensureVisible(find.text(t('accountVerifySave')));
        await tester.tap(find.text(t('accountVerifySave')));
        await tester.pumpAndSettle();
        expect(vault.profiles, isEmpty);
        expect(find.text(t('accountFailed')), findsOneWidget);
        if (language != 'zh-CN') expect(find.text('验证未通过'), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        await tester.pumpAndSettle();
        app.dispose();
      }
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  testWidgets(
      'account manager is not recursively navigable and missing balance is not announced as synchronized',
      (tester) async {
    final vault = await memoryVault(legacy: 'FIXTURE-LOCAL-ONLY');
    final app = AppState(
        storage: NovelAiAccountStorage(vault),
        api: NovelAiAccountApi(vault,
            clientFactory: (_, __) => MockClient((r) async =>
                http.Response('{"subscription":{"tier":0}}', 200))));
    addTearDown(app.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app, child: const MaterialApp(home: NovelAiAccountsScreen())));
    await tester.pumpAndSettle();
    expect(find.text('管理'), findsNothing);
    await tester.tap(find.text('验证').first);
    await tester.pumpAndSettle();
    expect(find.text('验证通过'), findsOneWidget);
    await tester.tap(find.text('验证通过'));
    await tester.pumpAndSettle();
    expect(find.text('连接与鉴权通过，接口未提供余额；未调用生图接口。'), findsOneWidget);
    expect(find.textContaining('已同步账号积分'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  test(
      'actual AppState selected generation saves image; token-read race blocks direct and UI activation',
      () async {
    final root = await Directory.systemTemp.createTemp('nai-account-state-');
    addTearDown(() => root.delete(recursive: true));
    final vault = await memoryVault(legacy: 'official-A');
    final relay = await vault.add(
        label: 'Selected Relay',
        method: 'relay',
        token: 'relay-B',
        apiBaseUrl: 'https://relay.example/raw',
        imageBaseUrl: 'https://relay.example/raw');
    final png =
        Uint8List.fromList(im.encodePng(im.Image(width: 64, height: 64)));
    final storage = DiskTestStorage(vault, root);
    var calls = 0;
    final api = NovelAiAccountApi(vault,
        clientFactory: (_, __) => MockClient((r) async {
              if (r.method == 'GET')
                return http.Response(
                    '{"subscription":{"tier":0,"trainingStepsLeft":91}}', 200);
              calls++;
              expect(r.url.toString(),
                  'https://relay.example/raw/ai/generate-image');
              expect(r.headers['Authorization'], 'Bearer relay-B');
              return http.Response.bytes(png, 200);
            }));
    final app = AppState(
        storage: storage, api: api, preloadCompletedImage: (_) async {});
    addTearDown(app.dispose);
    await app.activateNaiAccount(relay.id);
    storage.readGate = Completer<void>();
    final result = app.generateArtistLabTemporary(
        panelParams: GenerateParams(positivePrompt: 'test'),
        panelExtras: GenerateExtras());
    expect(app.naiAccountLocked, true);
    await expectLater(app.activateNaiAccount('legacy-v1'), throwsStateError);
    await expectLater(
        storage.setToken('replacement-during-read'), throwsStateError);
    await expectLater(vault.activate('legacy-v1'), throwsStateError);
    storage.readGate!.complete();
    final item = await result;
    expect(await File(item.filePath).readAsBytes(), png);
    expect(calls, 1);
    expect(app.naiAccountLocked, false);
    await app.activateNaiAccount('legacy-v1');
    expect(await storage.getToken(), 'official-A');
  });
  testWidgets(
      'workbench selector activates B and exposes all three real methods',
      (tester) async {
    final vault = await memoryVault(legacy: 'A');
    final b = await vault.add(label: 'Account B', method: 'token', token: 'B');
    final app = AppState(
        storage: NovelAiAccountStorage(vault),
        api: NovelAiAccountApi(vault,
            clientFactory: (_, __) => MockClient((r) async => http.Response(
                '{"subscription":{"tier":0,"trainingStepsLeft":91}}', 200))));
    addTearDown(app.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child:
            const MaterialApp(home: Scaffold(body: NovelAiAccountSelector()))));
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Account B · 官方 API Token').last);
    await tester.pumpAndSettle();
    expect(vault.active!.profile.id, b.id);
    expect(await app.storage.getToken(), 'B');
    await tester.tap(find.text('管理'));
    await tester.pumpAndSettle();
    expect(find.text('API 账号管理'), findsOneWidget);
    await tester.scrollUntilVisible(find.byType(SegmentedButton<String>), 250,
        scrollable: find
            .descendant(
                of: find.byType(ListView), matching: find.byType(Scrollable))
            .first);
    expect(find.text('官方 Token'), findsOneWidget);
    expect(find.text('邮箱密码'), findsOneWidget);
    expect(find.text('中转 Token'), findsOneWidget);
    await tester.tap(find.text('邮箱密码'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.widgetWithText(TextField, '密码（不保存）'), 250,
        scrollable: find
            .descendant(
                of: find.byType(ListView), matching: find.byType(Scrollable))
            .first);
    expect(find.widgetWithText(TextField, '密码（不保存）'), findsOneWidget);
    await tester.scrollUntilVisible(find.byType(SegmentedButton<String>), -250,
        scrollable: find
            .descendant(
                of: find.byType(ListView), matching: find.byType(Scrollable))
            .first);
    await tester.tap(find.text('中转 Token'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.widgetWithText(TextField, '中转平台 API Token'), 250,
        scrollable: find
            .descendant(
                of: find.byType(ListView), matching: find.byType(Scrollable))
            .first);
    expect(find.widgetWithText(TextField, '中转平台 API Token'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
