import 'dart:math';

import 'agent_models.dart';

int clampAgentContextWindow(Object? value) => max(8192,
    min(2000000, value is num ? value.round() : defaultAgentContextWindow));

double clampAgentCompactThreshold(Object? value) {
  final parsed = value is num ? value.toDouble() : defaultAgentCompactThreshold;
  return parsed.clamp(0.5, 0.95).toDouble();
}

double adaptiveAgentCompactThreshold(
    Object? contextValue, Object? outputValue) {
  final context = clampAgentContextWindow(contextValue);
  final output =
      max(512, min(context, outputValue is num ? outputValue.round() : 8192));
  final baseline = context <= 32768
      ? .70
      : context <= 65536
          ? .75
          : context <= 131072
              ? .80
              : context <= 262144
                  ? .84
                  : context <= 1048576
                      ? .88
                      : .90;
  final reserve = min(context * .5, output + 4096);
  return clampAgentCompactThreshold(min(baseline, 1 - reserve / context));
}

int estimateAgentTextTokens(String text) {
  if (text.isEmpty) return 0;
  final cjk = RegExp(r'[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]')
      .allMatches(text)
      .length;
  final remaining = max(0, text.length - cjk);
  return max(1, (cjk + remaining / 4).ceil());
}

int estimateAgentConversationTokens(List<AgentMessage> messages) =>
    messages.fold(0, (total, message) {
      final attachments = message.attachments.fold<int>(
          0,
          (sum, item) =>
              sum +
              (item.kind == 'image'
                  ? 1200
                  : estimateAgentTextTokens(item.name) + 80));
      final tools = message.tools.fold<int>(
          0,
          (sum, item) =>
              sum +
              estimateAgentTextTokens('${item.input ?? const {}}') +
              estimateAgentTextTokens(item.output ?? item.error ?? ''));
      return total +
          estimateAgentTextTokens(message.content) +
          estimateAgentTextTokens(message.reasoning ?? '') +
          attachments +
          tools +
          8;
    });

AgentContextSnapshot createAgentContextSnapshot(
  List<AgentMessage> messages,
  Object? limitValue,
  Object? thresholdValue, [
  AgentTokenUsage? latestUsage,
]) {
  final limit = clampAgentContextWindow(limitValue);
  final threshold = clampAgentCompactThreshold(thresholdValue);
  final hasRealUsage = latestUsage != null && latestUsage.input > 0;
  final used = hasRealUsage
      ? latestUsage.input +
          latestUsage.cacheRead +
          latestUsage.output +
          latestUsage.reasoning
      : estimateAgentConversationTokens(messages);
  return AgentContextSnapshot(
    used: used,
    limit: limit,
    percent: (used / limit * 100).clamp(0, 100).toDouble(),
    danger: used >= limit * threshold,
    estimated: hasRealUsage ? latestUsage.estimated : true,
  );
}

bool shouldAutoCompactAgent(
  AgentContextSnapshot snapshot,
  bool enabled,
  Object? thresholdValue,
) =>
    enabled &&
    snapshot.used >=
        snapshot.limit * clampAgentCompactThreshold(thresholdValue);
