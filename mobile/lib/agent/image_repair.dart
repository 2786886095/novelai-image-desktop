import 'dart:async';
import 'agent_models.dart';
import 'agent_provider.dart';
import 'image_continuity.dart';
import 'tavern_prompt.dart';

/// One bounded format repair, never a second generation or a parameter rewrite.
Future<({Map<String,dynamic> raw, String state, AgentTokenUsage? usage})> repairImagePrompt({
  required Map<String,dynamic> raw, TavernImageProposal? base, String? model,
  required Future<AgentProviderTurn> Function(String) request,
  required void Function() checkCancelled, required void Function() abortRequest,
  void Function()? onStart, Duration timeout = const Duration(seconds:45),
}) async {
  checkCancelled();
  if (resolveImagePrompt(raw,base,model:model).continuity['reviewRequired'] != true) {
    return (raw:raw,state:'unchanged',usage:null);
  }
  try {
    onStart?.call();
    final instruction = """Repair only the machine-readable image block from your last reply. Return exactly one <langbai-image> JSON block.
${imageStateContext(base,model:model)}
Apply only the latest original user request, preserving all unrelated details. Never change image parameters, stylePrompt or negativePrompt.
${base?.scene != null ? 'Return baseImageId plus scenePatch with exact revision and before objects. Do not replace the scene or alter locked identities.' : base != null ? 'Return baseImageId plus literal promptPatch, never a full replacement.' : 'Return a valid first scene, using entities:[] and scene facts for scenery without characters.'}
If ambiguous, omit the block rather than inventing changes.""";
    final turn=await request(instruction).timeout(timeout,onTimeout:(){abortRequest();throw TimeoutException('REPAIR_TIMEOUT');});
    checkCancelled();
    final candidate=parseLangbaiImageProposal(turn.content).proposal?.toJson();
    if(candidate==null) return (raw:raw,state:'failed',usage:turn.usage);
    final merged=Map<String,dynamic>.from(raw);
    for(final key in ['positivePrompt','promptMode','baseImageId','promptPatch','scene','scenePatch']) {
      merged.remove(key);if(candidate.containsKey(key)) merged[key]=candidate[key];
    }
    final checked=resolveImagePrompt(merged,base,model:model);
    return checked.continuity['reviewRequired'] != true && checked.positivePrompt.trim().isNotEmpty
      ? (raw:merged,state:'repaired',usage:turn.usage) : (raw:raw,state:'failed',usage:turn.usage);
  } catch (_) {checkCancelled();return (raw:raw,state:'failed',usage:null);}
}
