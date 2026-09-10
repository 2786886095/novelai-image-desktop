import 'dart:convert';
import '../models/nai_models.dart';
import 'scene_bindings.dart';
import 'agent_models.dart';

const imageContinuityInstruction =
    r"""Image revision contract (application-owned):
The separate <langbai-image-state> is the authoritative CURRENT image, even after chat summarization. Older image blocks are history, not the current state.
For an edit of that image, output <langbai-image> JSON with baseImageId equal to its imageId and promptPatch:{replacements:[{from:"exact existing substring",to:"replacement"}],append:["new prompt fragment"]}. Do not rewrite positivePrompt for an edit. Empty replacements/append preserve the prompt exactly (e.g. size-only edits).
Only replace or delete something explicitly changed by the latest user request. Preserve established clothing, appearance, characters, style-independent details and all unrelated requirements. Do not silently abbreviate or paraphrase old requirements. from must occur exactly once; use a longer exact fragment to disambiguate. An empty to explicitly removes that fragment. append contains only new details.
Only when <langbai-image-state> is null, output a first image (structured scene for supported models, otherwise promptMode:"new" and positivePrompt). When state exists, always use its patch contract. The user starts a new scene through the application reset control; a model-authored promptMode:"new" cannot reset existing state. Never use new merely because the conversation is long or the user adds background, light, pose or clothing details.
The other image parameter rules still apply: only explicit numerical overrides; never author stylePrompt or negativePrompt. Keep all machine blocks private. Ordinary chat has no image block.""";

TavernImageProposal? latestImageState(List<AgentMessage> messages,
    {String? characterId, String? resetAt}) {
  for (final m in messages.reversed) {
    final p = m.imageProposal;
    if (m.status != 'complete' ||
        (characterId != null &&
            m.characterId != null &&
            m.characterId != characterId)) continue;
    if (resetAt != null && p != null && p.createdAt.compareTo(resetAt) <= 0) {
      continue;
    }
    if (p != null &&
        p.positivePrompt.trim().isNotEmpty &&
        p.continuity?['reviewRequired'] != true &&
        !['cancelled', 'error'].contains(p.status)) return p;
  }
  return null;
}

String imageStateContext(TavernImageProposal? base, {String? model}) =>
    '${model == null ? '' : 'Selected image model: $model. ${GenerateParams.fromJson({'model': model}).isV4Plus ? 'First images MUST use scene, not positivePrompt. Scenery uses entities:[] and scene facts.' : 'Use the unstructured first-image contract.'}\n'}$imageContinuityInstruction\n$sceneBindingsInstruction\n<langbai-image-state>${jsonEncode(base == null ? null : {
        'imageId': base.id,
        'positivePrompt': base.positivePrompt,
        if (base.scene != null) 'scene': base.scene
      })}</langbai-image-state>';

({String positivePrompt, Map<String, dynamic> continuity, Map<String,dynamic>? scene}) resolveImagePrompt(
    Map<String, dynamic> raw, TavernImageProposal? base, {String? model}) {
  final candidate =
      raw['positivePrompt'] is String ? raw['positivePrompt'] as String : '';
  final unchanged = <String, dynamic>{
    if (base != null) ...{
      'baseImageId': base.id,
      'previousPrompt': base.positivePrompt
    },
    'reviewRequired': false,
    'changes': <Map<String, dynamic>>[]
  };
  ({String positivePrompt, Map<String, dynamic> continuity, Map<String,dynamic>? scene}) hold() => (
        scene:null,
        positivePrompt: base?.positivePrompt ?? candidate,
        continuity: {
          ...unchanged,
          'reviewRequired': true,
          if (candidate.trim().isNotEmpty) 'suggestedPrompt': candidate
        }
      );
  if (base == null && model != null && GenerateParams.fromJson({'model':model}).isV4Plus && raw['scene'] == null) {
    return (scene:null, positivePrompt:candidate, continuity:{...unchanged,'reviewRequired':true,'bindingError':'SCENE_REQUIRED'});
  }
  if (base?.scene != null || raw.containsKey('scene') || raw.containsKey('scenePatch')) {
    try {
      Map<String,dynamic> scene;
      if (base == null) {
        final parsed = readSceneBindings(raw['scene']);
        if (parsed == null || raw.containsKey('scenePatch') || raw.containsKey('promptPatch')) throw StateError('SCENE_INVALID');
        scene = parsed;
      } else {
        if (base.scene == null || raw['baseImageId'] != base.id || raw.containsKey('scene') || raw.containsKey('promptPatch') || raw['promptMode'] == 'new') throw StateError('SCENE_STALE');
        scene = applyScenePatch(base.scene!, raw['scenePatch']);
      }
      final compiled = compileSceneBindings(scene);
      if ((compiled['positivePrompt'] as String).trim().isEmpty) throw StateError('SCENE_INVALID');
      final ops = raw['scenePatch']?['operations'] as List? ?? [];
      return (scene:scene, positivePrompt:compiled['positivePrompt'] as String, continuity:{...unchanged,'changes':ops.map((op) => {'from':op['before']?['prompt'] ?? jsonEncode(op['before'] ?? ''),'to':op['after']?['prompt'] ?? jsonEncode(op['after'] ?? '')}).toList()});
    } catch (error) {
      return (scene:base?.scene == null ? null : readSceneBindings(base!.scene),positivePrompt:base?.positivePrompt ?? candidate,continuity:{...unchanged,'reviewRequired':true,'bindingError':error is StateError ? error.message.toString() : 'SCENE_INVALID'});
    }
  }
  if (base == null) {
    return (
      scene:null,
      positivePrompt: candidate,
      continuity: {
        ...unchanged,
        'reviewRequired':
            candidate.trim().isEmpty || raw.containsKey('promptPatch')
      }
    );
  }
  if (raw['promptMode'] == 'new' &&
      candidate.trim().isNotEmpty &&
      !raw.containsKey('promptPatch')) return hold();
  if (!raw.containsKey('promptPatch')) {
    return candidate == base.positivePrompt
        ? (scene:null,positivePrompt: candidate, continuity: unchanged)
        : hold();
  }
  final patch = raw['promptPatch'];
  if (raw['baseImageId'] != base.id || patch is! Map) return hold();
  final replacements = patch['replacements'];
  final append = patch['append'];
  if (replacements is! List ||
      append is! List ||
      replacements.length + append.length > 64) return hold();
  var prompt = base.positivePrompt;
  final changes = <Map<String, String>>[];
  for (final op in replacements) {
    if (op is! Map ||
        op['from'] is! String ||
        (op['from'] as String).isEmpty ||
        op['to'] is! String ||
        (op['to'] as String).length > 100000) return hold();
    final from = op['from'] as String;
    final to = op['to'] as String;
    final at = prompt.indexOf(from);
    if (at < 0 || prompt.indexOf(from, at + 1) >= 0) return hold();
    prompt = prompt.substring(0, at) + to + prompt.substring(at + from.length);
    changes.add({'from': from, 'to': to});
  }
  for (final fragment in append) {
    if (fragment is! String ||
        fragment.trim().isEmpty ||
        fragment.length > 100000) return hold();
    prompt += '${prompt.trim().isNotEmpty ? ', ' : ''}$fragment';
    changes.add({'from': '', 'to': fragment});
  }
  if (prompt.trim().isEmpty || prompt.length > 100000) return hold();
  return (
    scene:null,
    positivePrompt: prompt,
    continuity: {...unchanged, 'changes': changes}
  );
}
