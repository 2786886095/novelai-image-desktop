import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';

const nativeSkillCheckpointKey = 'native_acceptance_skill_cold_checkpoint_v1';
String nativeSkillSettingsDigest(AppSettings s) => sha256
    .convert(utf8.encode(jsonEncode([
      s.reversePromptTemplateVersion,
      s.reversePromptSkillVersion,
      s.convertPromptTemplateVersion,
      s.convertPromptSkillVersion,
      s.promptAssistantTemplateVersion,
      s.promptAssistantSkillVersion,
      s.promptAssistantMode,
      s.reversePromptTemplates,
      s.reversePromptTemplatesV45,
      s.reversePromptTemplatesV2,
      s.convertPromptTemplates,
      s.convertPromptTemplatesV45,
      s.convertPromptTemplatesV2,
      s.promptOptimizeTemplate,
      s.promptAssistantTemplate,
      s.promptOptimizeTemplateV2,
      s.promptAssistantTemplateV2
    ])))
    .toString();
Future<void> writeNativeSkillCheckpoint(
    AppSettings s, String sourceSha, String profileSha) async {
  final ok = await (await SharedPreferences.getInstance()).setString(
      nativeSkillCheckpointKey,
      jsonEncode({
        'sourceSha': sourceSha,
        'profileSha': profileSha,
        'settingsDigest': nativeSkillSettingsDigest(s),
        'producerEntry': 'text15'
      }));
  if (!ok) {
    throw StateError('Native skill predecessor checkpoint not persisted');
  }
}
