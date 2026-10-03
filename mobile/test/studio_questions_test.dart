import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_questions.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/screens/studio_question_cards.dart';

void main() {
  final input = {
    'questions': [
      for (final prompt in ['Question one', 'Question two'])
        {
          'prompt': prompt,
          'prompt_note': '',
          'options': [
            {'label': 'First', 'description': '', 'recommended': true},
            {'label': 'Second'}
          ]
        }
    ]
  };
  test('strict question metadata matches desktop and recommendation is only a boolean',() {
    for(final extra in [ {'authority':'auto'}, {'prompt_note':9}, {'prompt_note':'x'*601} ]) {
      final q={'prompt':'Question','options':[{'label':'A'},{'label':'B'}],...extra};
      expect(()=>normalizeAgentQuestions({'questions':[q]}),throwsFormatException);
    }
    expect(()=>normalizeAgentQuestions({'questions':[{'prompt':'Q','options':[
      {'label':'A','recommended':'true'},{'label':'B'}]}]}),throwsFormatException);
  });
  testWidgets('custom answer is explicit, survives navigation, and a failed callback can retry', (tester) async {
    final request=AgentQuestionRequest('chat',normalizeAgentQuestions(input));var calls=0;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(child:StudioQuestionCards(
      request:request,language:'en-US',onRespond:(_,__,answers){calls++;if(calls==1) throw StateError('retry');return true;})))));
    expect(find.byType(TextField),findsNothing);
    await tester.tap(find.text('Custom answer'));await tester.pump();
    await tester.enterText(find.byType(TextField),'Fixture custom answer');
    await tester.tap(find.text('Next'));await tester.pump();expect(calls,0);
    await tester.tap(find.text('Previous'));await tester.pump();
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,'Fixture custom answer');
    await tester.tap(find.text('Confirm'));await tester.pump();expect(calls,0);
    await tester.tap(find.text('First'));await tester.pump();expect(calls,1);
    await tester.tap(find.text('Second'));await tester.pump();expect(calls,2);
    await tester.tap(find.text('Second'));expect(calls,2);
  });
  test(
      'question contract, partial answers and unknown options stay fail closed',
      () {
    final request =
        AgentQuestionRequest('chat', normalizeAgentQuestions(input));
    expect(request.questions.first.options.first.description, isNull);
    expect(
        () => validateAgentQuestionAnswers(request, []), throwsFormatException);
    expect(
        () => validateAgentQuestionAnswers(request, [
              {'questionId': 'q1', 'optionId': 'o1'},
              {'questionId': 'q2', 'optionId': 'unknown'}
            ]),
        throwsFormatException);
  });
  test('mobile Studio defaults and all per-conversation options round trip',
      () {
    final c = AgentConversation(
        id: 'chat',
        title: 'Q',
        studioApprovalMode: 'auto',
        studioPresetId: 'studio-complete',
        studioWebSearchEnabled: true,
        studioTemplateEnabled: false);
    final w = AgentWorkspace(conversations: [
      c
    ], studioDefaults: {
      'studioApprovalMode': 'auto',
      'studioPresetId': 'studio-complete'
    });
    final restored = AgentWorkspace.fromJson(w.toJson());
    expect(restored.conversations.first.studioApprovalMode, 'auto');
    expect(restored.conversations.first.studioTemplateEnabled, false);
    expect(restored.conversations.first.studioWebSearchEnabled, true);
    expect(restored.studioDefaults['studioPresetId'], 'studio-complete');
  });
  testWidgets(
      'recommendations are not selected; option click confirms each question exactly once; navigation remains',
      (tester) async {
    final request =
        AgentQuestionRequest('chat', normalizeAgentQuestions(input));
    var calls = 0;
    List<Map<String, dynamic>>? submitted;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: StudioQuestionCards(
                    request: request,
                    language: 'en-US',
                    onRespond: (id, chat, answers) {
                      calls++;
                      submitted = answers;
                      return true;
                    })))));
    expect(calls, 0);
    expect(find.text('Submit answers'), findsNothing);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(find.text('Question two'), findsOneWidget);
    await tester.tap(find.text('Previous'));
    await tester.pumpAndSettle();
    expect(find.text('Question one'), findsOneWidget);
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Second'));
    await tester.pump();
    expect(calls, 1);
    expect(submitted, [
      {'questionId': 'q1', 'optionId': 'o1'},
      {'questionId': 'q2', 'optionId': 'o2'}
    ]);
    await tester.tap(find.text('Second'));
    expect(calls, 1);
  });
}
