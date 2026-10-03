import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_questions.dart';
import 'package:novelai_mobile/screens/studio_question_cards.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class SyntheticStorage extends Storage {
  bool fail = false;
  int writes = 0;
  @override
  Future<void> setAgentWorkspace(AgentWorkspace value) async {
    writes++;
    if (fail) throw StateError('fixture disk failure');
  }
}

void main() {
  final fixture = jsonDecode(
          File('test/fixtures/agent_question_options.json').readAsStringSync())
      as Map<String, dynamic>;
  test(
      'actual shared controller preferences do not advance activity; failed writes and locks preserved',
      () async {
    final store = SyntheticStorage(),
        app = AppState(storage: SyntheticStorage());
    final ownedApp = AppState(storage: store);
    final controller = AgentController(app: ownedApp);
    addTearDown(controller.dispose);
    addTearDown(ownedApp.dispose);
    addTearDown(app.dispose);
    final older = AgentConversation(
            id: 'older', title: 'Older', updatedAt: fixture['older']),
        recent = AgentConversation(
            id: 'recent', title: 'Recent', updatedAt: fixture['recent']);
    controller.workspace = AgentWorkspace(
        conversations: [recent, older], selectedConversationId: 'older');
    for (final kind in ['web', 'template', 'preset']) {
      final before = older.updatedAt;
      await controller.setStudioOptions(
          webSearchEnabled: kind == 'web' ? true : null,
          templateEnabled: kind == 'template' ? false : null,
          presetId: kind == 'preset' ? 'studio-complete' : null);
      print('SHARED_PREFERENCE ' +
          jsonEncode({
            'kind': kind,
            'before': before,
            'after': older.updatedAt,
            'order':
                controller.workspace.conversations.map((c) => c.id).toList()
          }));
      expect(older.updatedAt, before);
      expect(controller.workspace.conversations.map((c) => c.id),
          ['recent', 'older']);
    }
    final before = jsonEncode({
      'chat': older.toJson(),
      'defaults': controller.workspace.studioDefaults
    });
    store.fail = true;
    await expectLater(
        controller.setStudioOptions(webSearchEnabled: false), throwsStateError);
    expect(
        jsonEncode({
          'chat': older.toJson(),
          'defaults': controller.workspace.studioDefaults
        }),
        before);
    store.fail = false;
    controller.sending = true;
    final writes = store.writes;
    await controller.setStudioOptions(webSearchEnabled: false);
    expect(store.writes, writes);
    controller.sending = false;
    older.archivedAt = '2026-10-01';
    await controller.setStudioOptions(webSearchEnabled: false);
    expect(store.writes, writes);
  });
  for (final layout in fixture['layouts']) {
    for (final custom in [true, false]) {
      testWidgets(
          '${layout['name']} actual widget confirmed answers survive remount custom=$custom',
          (tester) async {
        tester.view.physicalSize = Size((layout['width'] as num).toDouble(),
            (layout['height'] as num).toDouble());
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final request = AgentQuestionRequest('owned',
                normalizeAgentQuestions({'questions': fixture['questions']})),
            sent = <List<Map<String, dynamic>>?>[];
        Future<void> mount() async {
          await tester.pumpWidget(MaterialApp(
              home: Scaffold(
                  body: SingleChildScrollView(
                      child: StudioQuestionCards(
                          request: request,
                          language: 'en-US',
                          onRespond: (_, __, answers) {
                            sent.add(answers);
                            return true;
                          })))));
          await tester.pump();
        }

        await mount();
        if (custom) {
          await tester.tap(find.text('Custom answer'));
          await tester.pump();
          await tester.enterText(find.byType(TextField), fixture['custom']);
          await tester.pump();
          await tester.tap(find.text('Confirm'));
        } else {
          await tester.tap(find.text('First'));
        }
        await tester.pump();
        expect(find.text('Q2'), findsOneWidget);
        await tester.tap(find.text('First'));
        await tester.pump();
        expect(find.text('Q3'), findsOneWidget);
        await tester.pumpWidget(const SizedBox());
        await mount();
        expect(find.text('Q3'), findsOneWidget);
        expect(sent, isEmpty);
        await tester.tap(find.text('First'));
        await tester.pump();
        expect(sent.length, 1);
        expect(sent.single!.length, 3);
        print('SHARED_REMOUNT ' +
            jsonEncode({
              'layout': layout['name'],
              'custom': custom,
              'sent': sent.length
            }));
      });
    }
  }
  testWidgets(
      'unconfirmed custom remount, edit invalidation, previous/next/cancel and request switch',
      (tester) async {
    final request = AgentQuestionRequest('owned',
            normalizeAgentQuestions({'questions': fixture['questions']})),
        sent = <List<Map<String, dynamic>>?>[];
    Future<void> mount(AgentQuestionRequest r) async {
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: SingleChildScrollView(
                  child: StudioQuestionCards(
                      request: r,
                      language: 'en-US',
                      onRespond: (_, __, a) {
                        sent.add(a);
                        return true;
                      })))));
      await tester.pump();
    }

    await mount(request);
    await tester.tap(find.text('Custom answer'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'Unconfirmed');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pump();
    await tester.tap(find.text('First'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    await mount(request);
    expect(find.text('Q3'), findsOneWidget);
    await tester.tap(find.text('First'));
    await tester.pump();
    expect(sent, isEmpty);
    expect(find.text('Q1'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Unconfirmed');
    await tester.tap(find.text('Confirm'));
    await tester.pump();
    expect(sent.length, 1);
    await tester.pumpWidget(const SizedBox());
    final other = AgentQuestionRequest(
        'owned', normalizeAgentQuestions({'questions': fixture['questions']}));
    await mount(other);
    expect(find.text('Q1'), findsOneWidget);
    await tester.tap(find.text('Custom answer'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'Confirmed');
    await tester.pump();
    await tester.tap(find.text('Confirm'));
    await tester.pump();
    await tester.tap(find.text('Previous'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'Changed');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pump();
    await tester.tap(find.text('First'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pump();
    await tester.tap(find.text('First'));
    await tester.pump();
    expect(sent.length, 1);
    expect(find.text('Q1'), findsOneWidget);
    await tester.tap(find.text('Cancel question'));
    await tester.pump();
    expect(sent.length, 2);
    expect(sent.last, isNull);
    await tester.pumpWidget(const SizedBox());
    await mount(other);
    expect(find.text('Q1'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });
}
