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
        storage: NovelAiAccountStorage(vault), api: NovelAiAccountApi(vault));
    addTearDown(app.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child:
            const MaterialApp(home: Scaffold(body: NovelAiAccountSelector()))));
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Account B · 官方').last);
    await tester.pumpAndSettle();
    expect(vault.active!.profile.id, b.id);
    expect(await app.storage.getToken(), 'B');
    await tester.tap(find.text('管理'));
    await tester.pumpAndSettle();
    expect(find.text('NovelAI 多账号工作区'), findsOneWidget);
    await tester.ensureVisible(find.byType(DropdownButtonFormField<String>));
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    expect(find.text('官方邮箱 + 密码'), findsOneWidget);
    expect(find.text('第三方 NovelAI 兼容 Token'), findsOneWidget);
    expect(find.text('官方 Persistent API Token'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
