import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/studio_agent_screen.dart';
import 'package:novelai_mobile/services/composer_transfers.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class ClipboardStorage extends Storage {
  ClipboardStorage(this.root);
  final Directory root;
  @override
  Future<Directory> agentWorkspaceDirectory() async => root;
  @override
  Future<Directory> agentAttachmentsDirectory([String? conversationId]) =>
      Directory('${root.path}/owned').create();
  @override
  Future<void> setAgentWorkspace(AgentWorkspace value) async {}
}

void main() {
  testWidgets('paste image only attaches to the draft and preserves input', (tester) async {
    final root = Directory.systemTemp.createTempSync('agent-image-paste-');
    addTearDown(() => root.deleteSync(recursive: true));
    final file = File('${root.path}/screenshot.png')
      ..writeAsBytesSync(File('../shared/image-metadata-compat-fixtures/metadata-free.png').readAsBytesSync());
    final calls = <MethodCall>[];
    var paths = [file.path];
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(ComposerTransfers.channel, (call) async {
      if (call.method != 'paste') return null;
      calls.add(call);
      return paths;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(ComposerTransfers.channel, null));
    tester.view.physicalSize = const Size(411, 914);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {tester.view.resetPhysicalSize();tester.view.resetDevicePixelRatio();});
    final app = AppState(storage: ClipboardStorage(root))..settings = AppSettings(language: 'zh-CN');
    final chat = AgentConversation(id: 'qa-paste-chat', title: 'QA Paste');
    final controller = AgentController(app: app)
      ..workspace = AgentWorkspace(conversations: [chat], selectedConversationId: chat.id)
      ..loaded = true;
    addTearDown(() { controller.dispose(); app.dispose(); });
    await tester.pumpWidget(ChangeNotifierProvider.value(value: app,
      child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('agent-composer-input')), 'leave this draft alone');
    final button = find.byKey(const ValueKey('agent-paste-image'));
    expect(button, findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(button);
      for (var i=0;i<100 && chat.draftAttachments.isEmpty;i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await tester.pumpAndSettle();
    expect(calls.single.arguments, {'imagesOnly': true});
    expect(chat.draftAttachments.single.kind, 'image');
    expect(chat.draftAttachments.single.name, 'screenshot.png');
    expect(File(chat.draftAttachments.single.filePath).readAsBytesSync(), file.readAsBytesSync());
    expect(find.text('leave this draft alone'), findsOneWidget);
    expect(chat.messages, isEmpty);
    debugPrint('MOBILE_CLIPBOARD: image-only native request, original bytes kept, draft retained, no send');
    paths = [];
    await tester.tap(button);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('剪贴板中没有可粘贴的图片。'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
