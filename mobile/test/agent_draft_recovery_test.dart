import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';

void main() {
  test('conversation draft survives workspace serialization', () {
    final chat = AgentConversation(
        id: 'draft-chat', title: 'Draft', draftText: '保留当前构图');
    final restored = AgentConversation.fromJson(chat.toJson());
    expect(restored.draftText, '保留当前构图');
    expect(restored.draftAttachments, isEmpty);
  });
}
