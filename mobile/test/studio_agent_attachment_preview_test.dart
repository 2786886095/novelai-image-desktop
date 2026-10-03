import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/studio_agent_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class PreviewStorage extends Storage {
  @override
  Future<void> setAgentWorkspace(AgentWorkspace value) async {}
  @override
  Future<Directory> agentWorkspaceDirectory() async =>
      Directory('${Directory.systemTemp.path}/qa-attachment-preview-workspace');
}

void main() {
  for (final entry in ['avatar', 'label']) {
    testWidgets('draft attachment $entry opens shared preview and delete stays separate',
        (tester) async {
      tester.view.physicalSize = const Size(411, 914);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final app = AppState(storage: PreviewStorage())
        ..settings = AppSettings(language: 'zh-CN');
      final attachment = AgentAttachment(
          id: 'qa-preview-image', name: 'qa-preview.png', mime: 'image/png',
          size: 0, kind: 'image', filePath: 'qa-missing-image-for-route-fixture.png');
      final chat = AgentConversation(id: 'qa-preview-chat', title: 'QA Preview',
          draftAttachments: [attachment]);
      final controller = AgentController(app: app)
        ..workspace = AgentWorkspace(conversations: [chat], selectedConversationId: chat.id)
        ..loaded = true;
      addTearDown(() { controller.dispose(); app.dispose(); });
      await tester.pumpWidget(ChangeNotifierProvider.value(value: app,
          child: MaterialApp(home: StudioAgentScreen(controller: controller))));
      await tester.pumpAndSettle();
      final chip = find.byType(InputChip);
      expect(chip, findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('agent-composer-input')), 'unsent QA draft');
      final target = entry == 'avatar'
          ? find.descendant(of: chip, matching: find.byType(Image))
          : find.text('qa-preview.png');
      await tester.tap(target, warnIfMissed: false);
      await tester.pumpAndSettle();
      final opened = find.byType(Dialog).evaluate().length == 1;
      // ignore: avoid_print
      print('ATTACHMENT_PREVIEW $entry opened=$opened attachments=${chat.draftAttachments.length}');
      expect(opened, isTrue, reason: 'A single native-equivalent tap must open the shared viewer');
      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(chat.draftAttachments, hasLength(1));
      await tester.tap(find.descendant(of: find.byType(Dialog),
          matching: find.byIcon(Icons.close)));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsNothing);
      expect(find.text('unsent QA draft'), findsOneWidget);
      expect(chat.draftAttachments, hasLength(1));
      await tester.tap(find.descendant(of: chip, matching: find.byType(Icon)).last);
      await tester.pumpAndSettle();
      expect(chat.draftAttachments, isEmpty);
      expect(find.byType(Dialog), findsNothing);
      expect(find.text('unsent QA draft'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    });
  }
}
