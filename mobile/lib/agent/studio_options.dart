// Minglink/dsh-infinite-gen-4 adaptation; CC BY-NC-SA 4.0, non-commercial.
// Pinned source 9097ccc1d22596087d47c732c317c29407c752ff; see THIRD_PARTY_NOTICES.md.
import 'dart:convert';
import 'agent_models.dart';
import 'lyra_preset_data.dart';
import 'tavern_prompt.dart';

const studioDefaultPresetId = 'dsh-infinite-gen-4';
const studioCompletePresetId = 'studio-complete';
const studioInfinitePrompt =
    r'''Be a direct, concise image-creation assistant. Deliver the requested prompt, visual analysis or actual image workflow rather than a generic lecture. Use the user's language, preserve explicit subjects, composition and exclusions, and ask only when missing information prevents a useful result. For analysis, distinguish visible facts from inference. For prompt work, organize subject, action, framing, lighting, style and negative constraints. Use real Studio tools for current parameters, registered references, generation plans and image execution; cite actual receipts and image results, never invent placeholders or claim an image was generated without a successful tool result. Discuss or inspect without generating when asked. Follow the application's selected confirm/full-auto mode, optional web and preset switches, and its actual available tools. This is an image-workflow adaptation of Infinite Generation Four's compact, direct delivery style, not the upstream offline security-documentation mode.''';
final studioCompletePrompt = [
  'Help the user plan and create images. Keep replies brief, preserve explicit image constraints, use actual Studio generation tools and receipts. Do not generate when asked only to discuss or inspect.',
  'Focus on NovelAI prompt composition, subject, action, lighting and framing. Preserve explicit tags and exclusions. Explain edits briefly; never invent an executed image.',
  'Analyze attached reference images and separate observed visual details from uncertainty. Preserve requested identity, clothing and composition in the generation plan. Use app image tools only when requested.',
  lyraPresetSystemPrompt,
  lyraPresetJailbreakPrompt
].join('\n\n');
String studioCreativeContext(AgentWorkspace workspace, AgentConversation chat) {
  final entries = activeTavernLorebookEntries(
      workspace.lorebooks.where((b) => chat.lorebookIds.contains(b.id)).toList(),
      chat.messages);
  String? body;
  if (chat.studioTemplateEnabled) {
    if (chat.studioPresetId == studioDefaultPresetId)
      body = studioInfinitePrompt;
    else if (chat.studioPresetId == studioCompletePresetId)
      body = studioCompletePrompt;
    else
      for (final p in workspace.samplerPresets) {
        if ('tavern:${p.id}' == chat.studioPresetId) {
          body = '${p.systemPrompt}\n${p.jailbreakPrompt}';
          break;
        }
      }
  }
  return jsonEncode({
    'preset': body,
    'characters': [
      for (final c in workspace.characters)
        if (chat.characterIds.contains(c.id))
          {
            'name': c.name,
            'description': c.description,
            'personality': c.personality,
            'scenario': c.scenario,
            'creativeInstructions': c.systemPrompt,
            'postscript': c.postHistoryInstructions
          }
    ],
    'worldbooks': [
      for (final b in workspace.lorebooks)
        if (chat.lorebookIds.contains(b.id))
          {
            'name': b.name,
            'entries': [
              for (final entry in entries)
                if (entry.$1.id == b.id)
                  {'title': entry.$2.comment, 'content': entry.$2.content}
            ]
          }
    ]
  });
}
