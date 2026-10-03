import 'agent_models.dart';

class AgentQuestionOption {
  final String id, label;
  final String? description;
  final bool recommended;
  const AgentQuestionOption(
      this.id, this.label, this.description, this.recommended);
}

class AgentQuestion {
  final String id, prompt;
  final List<AgentQuestionOption> options;
  const AgentQuestion(this.id, this.prompt, this.options);
}

class AgentQuestionRequest {
  final String id, conversationId;
  final List<AgentQuestion> questions;
  // Request-owned ephemeral UI state; never serialized to a workspace/profile.
  int draftIndex = 0;
  final confirmedAnswers = <String, Map<String, dynamic>>{};
  final confirmedQuestionIds = <String>{};
  final customDrafts = <String, String>{};
  final customQuestionIds = <String>{};
  void clearDraft() {
    draftIndex = 0;
    confirmedAnswers.clear();
    confirmedQuestionIds.clear();
    customDrafts.clear();
    customQuestionIds.clear();
  }

  AgentQuestionRequest(this.conversationId, this.questions)
      : id = agentId('question');
}

String _text(Object? value, int max) {
  if (value is! String || value.trim().isEmpty || value.length > max)
    throw const FormatException('Invalid question text');
  return value.trim();
}

List<AgentQuestion> normalizeAgentQuestions(Map<String, dynamic> input) {
  if (input.keys.any((k) => k != 'questions')) {
    throw const FormatException('Unexpected question fields');
  }
  final raw = input['questions'];
  if (raw is! List || raw.isEmpty || raw.length > 3)
    throw const FormatException('Expected one to three questions');
  return [
    for (var i = 0; i < raw.length; i++)
      (() {
        final q = raw[i];
        if (q is! Map || q['options'] is! List)
          throw const FormatException('Invalid question');
        if (q.keys.any(
                (k) => !['prompt', 'options', 'prompt_note'].contains(k)) ||
            (q.containsKey('prompt_note') &&
                (q['prompt_note'] is! String ||
                    (q['prompt_note'] as String).length > 600))) {
          throw const FormatException('Invalid question metadata');
        }
        final options = q['options'] as List;
        if (options.length < 2 || options.length > 6)
          throw const FormatException('Expected two to six options');
        final normalized = <AgentQuestionOption>[];
        for (var n = 0; n < options.length; n++) {
          final o = options[n];
          if (o is! Map) throw const FormatException('Invalid option');
          if (o.keys.any((k) =>
                  !['label', 'description', 'recommended'].contains(k)) ||
              (o.containsKey('recommended') && o['recommended'] is! bool)) {
            throw const FormatException('Invalid option metadata');
          }
          final desc = o['description'];
          if (desc != null && (desc is! String || desc.length > 400))
            throw const FormatException('Invalid option description');
          normalized.add(AgentQuestionOption(
              'o${n + 1}',
              _text(o['label'], 120),
              desc is String && desc.trim().isNotEmpty ? desc.trim() : null,
              o['recommended'] == true));
        }
        if (normalized.where((o) => o.recommended).length > 1)
          throw const FormatException('Only one recommendation');
        return AgentQuestion('q${i + 1}', _text(q['prompt'], 600), normalized);
      })()
  ];
}

List<Map<String, dynamic>> validateAgentQuestionAnswers(
    AgentQuestionRequest request, List<Map<String, dynamic>> answers) {
  if (answers.length != request.questions.length)
    throw const FormatException('Answer every question');
  return request.questions.map((q) {
    final rows = answers.where((a) => a['questionId'] == q.id).toList();
    if (rows.length != 1)
      throw const FormatException('Invalid question identity');
    final a = rows.single;
    if (a['optionId'] is String &&
        a['text'] == null &&
        q.options.any((o) => o.id == a['optionId']))
      return <String, dynamic>{'questionId': q.id, 'optionId': a['optionId']};
    if (a['optionId'] == null)
      return <String, dynamic>{
        'questionId': q.id,
        'text': _text(a['text'], 4000)
      };
    throw const FormatException('Invalid option identity');
  }).toList();
}

const agentQuestionToolSchema = <String, dynamic>{
  'type': 'function',
  'function': {
    'name': 'langbai_ask_question',
    'description':
        'Ask one to three questions. The app waits for explicit user choices; recommendations are never automatic approval.',
    'parameters': {
      'type': 'object',
      'additionalProperties': false,
      'required': ['questions'],
      'properties': {
        'questions': {
          'type': 'array',
          'minItems': 1,
          'maxItems': 3,
          'items': {
            'type': 'object',
            'additionalProperties': false,
            'required': ['prompt', 'options'],
            'properties': {
              'prompt': {'type': 'string', 'minLength': 1, 'maxLength': 600},
              'prompt_note': {'type': 'string', 'maxLength': 600},
              'options': {
                'type': 'array',
                'minItems': 2,
                'maxItems': 6,
                'items': {
                  'type': 'object',
                  'additionalProperties': false,
                  'required': ['label'],
                  'properties': {
                    'label': {
                      'type': 'string',
                      'minLength': 1,
                      'maxLength': 120
                    },
                    'description': {'type': 'string', 'maxLength': 400},
                    'recommended': {'type': 'boolean'}
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};
