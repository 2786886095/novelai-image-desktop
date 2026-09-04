import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_context.dart';
import 'package:novelai_mobile/agent/agent_models.dart';

void main() {
  test('estimates CJK and Latin text conservatively', () {
    expect(estimateAgentTextTokens('测试'), 2);
    expect(estimateAgentTextTokens('abcdefgh'), 2);
  });

  test('real provider usage replaces transcript estimate', () {
    final messages = [
      AgentMessage(id: 'm', role: 'user', content: 'hello'),
    ];
    final snapshot = createAgentContextSnapshot(
      messages,
      10000,
      .8,
      AgentTokenUsage(input: 7000, output: 500, cacheRead: 600),
    );
    expect(snapshot.used, 8100);
    expect(snapshot.danger, isTrue);
    expect(snapshot.estimated, isFalse);
  });

  test('context configuration is clamped to safe bounds', () {
    expect(clampAgentContextWindow(1), 8192);
    expect(clampAgentContextWindow(3000000), 2000000);
    expect(clampAgentCompactThreshold(.1), .5);
    expect(clampAgentCompactThreshold(1), .95);
    expect(adaptiveAgentCompactThreshold(32768, 4096), closeTo(.70, .001));
    expect(adaptiveAgentCompactThreshold(1048576, 32768), closeTo(.88, .001));
  });
}
