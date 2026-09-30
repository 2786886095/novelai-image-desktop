import 'dart:convert';
import 'agent_models.dart';
import 'scene_bindings.dart';

// Keep the canonical proposal intact: retries and scene patches must not append
// rendering instructions or duplicate character descriptions.
String compatibleProposalPrompt(TavernImageProposal proposal) {
  var prompt = proposal.positivePrompt;
  if (proposal.scene != null) {
    final scene = readSceneBindings(proposal.scene);
    if (scene == null) throw StateError('SCENE_INVALID');
    final compiled = compileSceneBindings(scene);
    final people = (scene['entities'] as List)
        .where((e) => e['kind'] == 'character')
        .toList();
    final parts = compiled['characterPrompts'] as List;
    String number(dynamic n) =>
        n is num && n == n.roundToDouble() ? n.toInt().toString() : '$n';
    prompt = [
      compiled['positivePrompt'],
      for (var i = 0; i < parts.length; i++)
        'Character ${i + 1}: ${parts[i]['prompt']}${parts[i]['useCoords'] == true ? " Position: x=${number(parts[i]['x'])}, y=${number(parts[i]['y'])} (normalized image coordinates)." : ""}',
      for (final e in (scene['entities'] as List)
          .where((e) => e['ownerId'] != null && e['wearerId'] != null))
        "Ownership: ${e['prompt']} belongs to character ${people.indexWhere((p) => p['id'] == e['ownerId']) + 1}.",
    ].where((s) => s.toString().isNotEmpty).join('\n');
  }
  if (prompt.trim().isEmpty) throw StateError('正面提示词不能为空。');
  return [
    prompt,
    if (proposal.stylePrompt.trim().isNotEmpty)
      'Visual style: ${proposal.stylePrompt}',
    if (proposal.negativePrompt.trim().isNotEmpty)
      'Avoid: ${proposal.negativePrompt}'
  ].join('\n');
}

String compatibleProposalHint(String language) => switch (language) {
      'zh-TW' => '使用設定中的圖片服務、模型與尺寸；角色風格和負面要求作為文字指令，不傳送 NovelAI 專屬參數。',
      'ja' =>
        '設定の画像サービス・モデル・サイズを使用します。キャラクターの画風と除外要件はテキスト指示として送り、NovelAI 専用パラメーターは送りません。',
      'ko' =>
        '설정의 이미지 서비스·모델·크기를 사용합니다. 캐릭터 화풍과 제외 조건은 텍스트 지시로 보내며 NovelAI 전용 매개변수는 보내지 않습니다.',
      'en' =>
        'Uses the image service, model and size saved in Settings. Character style and exclusions are text instructions; NovelAI-only parameters are not sent.',
      _ => '使用设置中的图片服务、模型和尺寸；角色风格和负面要求作为文本指令，不发送 NovelAI 专属参数。',
    };

String compatibleProposalContext(dynamic model, dynamic size) =>
    'Selected image service: OpenAI Images compatible text-to-image. Model: ${jsonEncode(model)}, size: ${jsonEncode(size)}. These override the native image defaults above. For a first image, positivePrompt is accepted; a structured scene is optional. For an established scene or prompt, retain its exact patch contract. Only prompt and count are supplied by this proposal; do not propose native model, size, steps, CFG or sampler overrides. Character style and exclusions are appended as text by the application.';
