import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/tavern_prompt.dart';

void main() {
  test('builds character, persona and matched lorebook context', () {
    final character = TavernCharacter(
      name: 'Alice',
      description: 'A clockmaker.',
      firstMessage: 'Hello {{user}}',
    );
    final persona = TavernPersona(name: 'Robin', description: 'A traveler.');
    final lorebook = TavernLorebook(
      name: 'Town',
      entries: [
        TavernLorebookEntry(
          keys: ['clock tower'],
          comment: 'Clock tower',
          content: 'The clock tower rings only at midnight.',
        ),
      ],
    );
    final chat = AgentConversation(
      id: 'chat',
      title: 'Story',
      messages: [
        AgentMessage(
            id: 'message', role: 'user', content: 'Visit the clock tower.'),
      ],
    );

    final prompt = buildTavernSystemPrompt(TavernPromptContext(
      conversation: chat,
      characters: [character],
      activeCharacter: character,
      persona: persona,
      lorebooks: [lorebook],
      preset: TavernSamplerPreset(),
    ));

    expect(prompt, contains('Alice'));
    expect(prompt, contains('Robin'));
    expect(prompt, contains('rings only at midnight'));
    expect(prompt, contains('<langbai-image>'));
  });

  test('keeps image integration when character card has a custom system prompt',
      () {
    final character = TavernCharacter(
      name: 'Alice',
      systemPrompt: 'Only speak as {{char}}.',
    );
    final prompt = buildTavernSystemPrompt(TavernPromptContext(
      conversation: AgentConversation(id: 'chat', title: 'Story'),
      characters: [character],
      activeCharacter: character,
      persona: null,
      lorebooks: const [],
      preset: TavernSamplerPreset(),
    ));

    expect(prompt, contains('<langbai-image>'));
    expect(prompt, contains('Only speak as Alice.'));
    expect(prompt, isNot(contains('{{char}}')));
  });

  test('extracts a hidden image proposal from visible roleplay text', () {
    final parsed = parseLangbaiImageProposal(
      '*Alice smiles.*\n<langbai-image>{"positivePrompt":"1girl, smile","width":832,"height":1216}</langbai-image>',
    );

    expect(parsed.visible, '*Alice smiles.*');
    expect(parsed.proposal?.positivePrompt, '1girl, smile');
    expect(parsed.proposal?.width, 832);
    expect(parsed.proposal?.height, 1216);
  });

  test('keeps right-panel parameters unless named as explicit overrides', () {
    const defaults = TavernImageParameterDefaults(
      model: 'nai-diffusion-5-full',
      width: 1088,
      height: 1920,
      steps: 31,
      scale: 4.5,
      sampler: 'k_euler_ancestral',
      count: 3,
    );
    final proposal = TavernImageProposal(
      positivePrompt: '1girl',
      model: 'nai-diffusion-4-5-full',
      width: 1024,
      height: 1024,
      steps: 20,
      scale: 6,
      sampler: 'k_dpmpp_2m',
      count: 1,
    );
    applyAuthoritativeTavernImageDefaults(proposal, defaults);
    expect(proposal.toJson(), containsPair('model', 'nai-diffusion-5-full'));
    expect((proposal.width, proposal.height), (1088, 1920));
    expect((proposal.steps, proposal.scale, proposal.count), (31, 4.5, 3));

    final explicit = TavernImageProposal(
      positivePrompt: '1girl',
      width: 832,
      height: 1216,
      count: 2,
      steps: 20,
      explicitParameters: ['size', 'count'],
    );
    applyAuthoritativeTavernImageDefaults(explicit, defaults);
    expect((explicit.width, explicit.height, explicit.count), (832, 1216, 2));
    expect(explicit.steps, 31);
  });

  test('includes application image defaults in private prompt context', () {
    final character = TavernCharacter(name: '软件智能生图');
    final prompt = buildTavernSystemPrompt(TavernPromptContext(
      conversation: AgentConversation(id: 'chat', title: 'Image planning'),
      characters: [character],
      activeCharacter: character,
      persona: null,
      lorebooks: const [],
      preset: TavernSamplerPreset(),
      imageDefaults: const TavernImageParameterDefaults(
        model: 'nai-diffusion-5-full',
        width: 1088,
        height: 1920,
        steps: 31,
        scale: 4.5,
        sampler: 'k_euler',
        count: 3,
      ),
    ));
    expect(prompt, contains('<langbai-image-defaults>'));
    expect(prompt, contains('"width":1088'));
    expect(prompt, contains('explicitParameters'));
  });

  test('swipe selection controls the prompt-visible message', () {
    final message = AgentMessage(
      id: 'message',
      role: 'assistant',
      content: 'fallback',
      swipes: ['first', 'second'],
      swipeIndex: 1,
    );
    expect(visibleTavernMessageContent(message), 'second');
  });

  test(
      'reasoning effort changes image-planning guidance without generic agent copy',
      () {
    final character = TavernCharacter(name: '软件智能生图');
    final detailed = buildTavernSystemPrompt(TavernPromptContext(
      conversation: AgentConversation(
        id: 'chat-high',
        title: 'Image planning',
        reasoningEffort: 'high',
      ),
      characters: [character],
      activeCharacter: character,
      persona: null,
      lorebooks: const [],
      preset: TavernSamplerPreset(),
    ));
    final automatic = buildTavernSystemPrompt(TavernPromptContext(
      conversation: AgentConversation(id: 'chat-auto', title: 'Image planning'),
      characters: [character],
      activeCharacter: character,
      persona: null,
      lorebooks: const [],
      preset: TavernSamplerPreset(),
    ));

    expect(detailed, contains('## Image planning effort'));
    expect(detailed, contains('tag interactions'));
    expect(automatic, isNot(contains('## Image planning effort')));
  });

  test('teaches the model to revise size without rebuilding the scene', () {
    final prompt = buildTavernSystemPrompt(TavernPromptContext(
      conversation: AgentConversation(id: 'chat', title: 'Image planning'),
      characters: [TavernCharacter(name: '软件智能生图')],
      activeCharacter: TavernCharacter(name: '软件智能生图'),
      persona: null,
      lorebooks: const [],
      preset: TavernSamplerPreset(),
    ));

    expect(prompt, contains('explicit revision request'));
    expect(prompt, contains('<langbai-current-image>'));
    expect(prompt, contains('832×1216'));
  });
}
