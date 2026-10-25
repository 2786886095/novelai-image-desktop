import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:novelai_mobile/agent/agent_provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';

class _ScriptedClient extends http.BaseClient {
  final Future<http.StreamedResponse> Function(http.BaseRequest request)
      handler;
  _ScriptedClient(this.handler);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      handler(request);
}

http.StreamedResponse _response(
  int status,
  String body, {
  String contentType = 'application/json',
}) =>
    http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode(body)),
      status,
      headers: {'content-type': contentType},
    );

Future<Map<String, dynamic>> _anthropicRequestBody({
  required String model,
  required String effort,
}) async {
  Map<String, dynamic>? body;
  var calls = 0;
  final client = AgentProviderClient(clientFactory: (settings, uri) async {
    expect(uri.toString(), 'https://fixture.invalid/v1/messages');
    return _ScriptedClient((request) async {
      calls++;
      expect(request.method, 'POST');
      expect(request.headers['x-api-key'], 'fixture-key');
      expect(request.headers['anthropic-version'], '2023-06-01');
      body = Map<String, dynamic>.from(
        jsonDecode((request as http.Request).body) as Map,
      );
      return _response(200, jsonEncode({
        'content': [{'type': 'text', 'text': 'fixture response'}],
        'usage': {'input_tokens': 2, 'output_tokens': 3},
      }));
    });
  });
  final result = await client.complete(
    settings: AppSettings(
      agentApiProtocol: 'anthropic-messages',
      agentApiBaseUrl: 'https://fixture.invalid/v1',
      agentApiModel: model,
      agentMaxOutputTokens: 1200,
    ),
    apiKey: 'fixture-key',
    messages: const [
      {'role': 'system', 'content': 'fixture guide'},
      {
        'role': 'user',
        'content': [
          {'type': 'text', 'text': 'look'},
          {
            'type': 'image_url',
            'image_url': {'url': 'data:image/png;base64,AA=='}
          },
        ],
      },
      {
        'role': 'assistant',
        'content': 'searching',
        'tool_calls': [
          {
            'id': 'fixture-call',
            'type': 'function',
            'function': {
              'name': 'langbai_search_tags',
              'arguments': '{"query":"smile"}',
            },
          },
        ],
      },
      {
        'role': 'tool',
        'tool_call_id': 'fixture-call',
        'content': 'fixture tags',
      },
    ],
    tools: const [
      {
        'type': 'function',
        'function': {
          'name': 'langbai_search_tags',
          'description': 'search',
          'parameters': {'type': 'object'},
        },
      },
    ],
    generationConfig: {
      'reasoningEffort': effort,
      'maxOutputTokens': 321,
      'temperature': 0.7,
      'topP': 0.9,
      'stop': ['fixture stop'],
    },
    onDelta: (_) {},
  );
  expect(calls, 1);
  expect(result.content, 'fixture response');
  expect(body?['model'], model.trim());
  expect(body?['max_tokens'], 321);
  expect(body?['stop_sequences'], ['fixture stop']);
  expect(body?['system'], 'fixture guide');
  return body!;
}

void main() {
  for (final status in ['incomplete', 'failed']) {
    test('Responses retains terminal $status state and usage', () async {
      final client = AgentProviderClient(clientFactory: (settings, uri) async =>
          _ScriptedClient((request) async => _response(200, jsonEncode({
            'status': status,
            'incomplete_details': {'reason': 'max_output_tokens'},
            'output': [],
            'usage': {'input_tokens': 20, 'output_tokens': 30, 'total_tokens': 50},
          }))));
      final result = await client.complete(
        settings: AppSettings(agentApiProtocol: 'openai-responses',
            agentApiBaseUrl: 'https://fixture.invalid/v1', agentApiModel: 'fixture'),
        apiKey: 'fixture', messages: const [{'role': 'user', 'content': 'hello'}],
        tools: const [], onDelta: (_) {},
      );
      expect(result.issue, status == 'incomplete' ? 'limit' : 'failed');
      expect(result.usage.total, 50);
    });
  }

  TestWidgetsFlutterBinding.ensureInitialized();

  group('Anthropic adaptive thinking request contract', () {
    for (final effort in ['low', 'medium', 'high']) {
      test('preserves selected $effort effort and native content', () async {
        final body = await _anthropicRequestBody(
          model: 'claude-opus-4-6',
          effort: effort,
        );
        expect(body['thinking'], {'type': 'adaptive'});
        expect(body['output_config'], {'effort': effort});
        expect(body.containsKey('temperature'), isFalse);
        expect(body.containsKey('top_p'), isFalse);
        expect(body.containsKey('reasoning_effort'), isFalse);
        expect(body['tools'], [
          {
            'name': 'langbai_search_tags',
            'description': 'search',
            'input_schema': {'type': 'object'},
          },
        ]);
        expect(body['messages'], [
          {
            'role': 'user',
            'content': [
              {'type': 'text', 'text': 'look'},
              {
                'type': 'image',
                'source': {
                  'type': 'base64',
                  'media_type': 'image/png',
                  'data': 'AA==',
                },
              },
            ],
          },
          {
            'role': 'assistant',
            'content': [
              {'type': 'text', 'text': 'searching'},
              {
                'type': 'tool_use',
                'id': 'fixture-call',
                'name': 'langbai_search_tags',
                'input': {'query': 'smile'},
              },
            ],
          },
          {
            'role': 'user',
            'content': [
              {
                'type': 'tool_result',
                'tool_use_id': 'fixture-call',
                'content': 'fixture tags',
              },
            ],
          },
        ]);
      });
    }

    for (final model in [
      'claude-opus-4-6',
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-opus-5-5',
      'claude-sonnet-4-6',
      'claude-sonnet-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
      'claude-fable-5',
      'claude-fable-5-1',
      'claude-mythos-preview',
      'claude-mythos-5',
      'claude-mythos-5-1',
      ' vendor/Claude-Opus-4.6-20260205 ',
      'vendor/nested/claude-sonnet-4.6-latest',
      'claude-opus-4-7-thinking',
      'claude-sonnet-5:thinking',
      'claude-opus-5-5-20261001-thinking',
      'claude-mythos-5-1-latest:thinking',
    ]) {
      test('recognizes known adaptive model $model', () async {
        final body = await _anthropicRequestBody(model: model, effort: 'medium');
        expect(body['thinking'], {'type': 'adaptive'});
        expect(body['output_config'], {'effort': 'medium'});
      });
    }

    for (final model in ['claude-opus-4-6', 'claude-sonnet-4-6']) {
      test('auto leaves 4.6 thinking and sampling to the provider: $model',
          () async {
        final body = await _anthropicRequestBody(model: model, effort: 'auto');
        expect(body.containsKey('thinking'), isFalse);
        expect(body.containsKey('output_config'), isFalse);
        expect(body['temperature'], 0.7);
        expect(body['top_p'], 0.9);
      });
    }

    for (final model in [
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
      'claude-fable-5',
      'claude-fable-5-1',
      'claude-mythos-preview',
      'claude-mythos-5',
      'claude-mythos-5-1',
    ]) {
      test('auto omits unsupported sampling without forcing effort: $model',
          () async {
        final body = await _anthropicRequestBody(model: model, effort: 'auto');
        expect(body.containsKey('thinking'), isFalse);
        expect(body.containsKey('output_config'), isFalse);
        expect(body.containsKey('temperature'), isFalse);
        expect(body.containsKey('top_p'), isFalse);
      });
    }

    for (final model in [
      'claude-sonnet-4-5',
      'claude-opus-4-5-20251101',
      'claude-test',
      'claude-sonnet-6',
      'claude-opus-4-9',
      'claude-sonnet-5-unknown',
    ]) {
      test('preserves older and unknown model behavior: $model', () async {
        final body = await _anthropicRequestBody(model: model, effort: 'high');
        expect(body.containsKey('thinking'), isFalse);
        expect(body.containsKey('output_config'), isFalse);
        expect(body['temperature'], 0.7);
        expect(body['top_p'], 0.9);
      });
    }

    test('a 400 error is surfaced without retrying or downgrading effort',
        () async {
      final bodies = <Map<String, dynamic>>[];
      final client = AgentProviderClient(clientFactory: (settings, uri) async =>
          _ScriptedClient((request) async {
            bodies.add(Map<String, dynamic>.from(
              jsonDecode((request as http.Request).body) as Map,
            ));
            return _response(400, jsonEncode({
              'error': {'message': 'unsupported thinking effort fixture'},
            }));
          }));
      await expectLater(
        client.complete(
          settings: AppSettings(
            agentApiProtocol: 'anthropic-messages',
            agentApiBaseUrl: 'https://fixture.invalid',
            agentApiModel: 'claude-opus-4-6',
          ),
          apiKey: 'fixture-key',
          messages: const [{'role': 'user', 'content': 'fixture'}],
          tools: const [],
          generationConfig: const {
            'reasoningEffort': 'high',
            'maxOutputTokens': 321,
          },
          onDelta: (_) {},
        ),
        throwsA(isA<AgentProviderException>()
            .having((error) => error.statusCode, 'statusCode', 400)
            .having((error) => error.message, 'message',
                'unsupported thinking effort fixture')),
      );
      expect(bodies, hasLength(1));
      expect(bodies.single['thinking'], {'type': 'adaptive'});
      expect(bodies.single['output_config'], {'effort': 'high'});
      expect(bodies.single['max_tokens'], 321);
    });
  });

  test('streams content, tool calls, and mutually exclusive token usage',
      () async {
    final received = <Map<String, dynamic>>[];
    final client = AgentProviderClient(clientFactory: (settings, uri) async {
      expect(uri.path, '/v1/chat/completions');
      return _ScriptedClient((request) async {
        final raw = request as http.Request;
        expect(request.headers['authorization'], 'Bearer test-key');
        received.add(Map<String, dynamic>.from(jsonDecode(raw.body) as Map));
        return _response(
          200,
          [
            'data: {"choices":[{"delta":{"content":"Hello "}}]}',
            '',
            'data: {"choices":[{"delta":{"content":"world","tool_calls":[{"index":0,"id":"call-1","function":{"name":"langbai_search_tags","arguments":"{\\"query\\":"}}]}}]}',
            '',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"smile\\"}"}}]}}]}',
            '',
            'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":30,"total_tokens":130,"prompt_tokens_details":{"cached_tokens":20},"completion_tokens_details":{"reasoning_tokens":10}}}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
          contentType: 'text/event-stream',
        );
      });
    });

    final deltas = StringBuffer();
    final result = await client.complete(
      settings: AppSettings(
        agentApiProtocol: 'openai-compatible',
        agentApiBaseUrl: 'https://provider.invalid/v1',
        agentApiModel: 'test-model',
      ),
      apiKey: 'test-key',
      messages: const [
        {'role': 'user', 'content': 'hello'},
      ],
      tools: const [
        {
          'type': 'function',
          'function': {
            'name': 'langbai_search_tags',
            'description': 'search',
            'parameters': {'type': 'object'},
          },
        },
      ],
      generationConfig: const {'reasoningEffort': 'high'},
      onDelta: deltas.write,
    );

    expect(deltas.toString(), 'Hello world');
    expect(result.content, 'Hello world');
    expect(result.toolCalls.single.name, 'langbai_search_tags');
    expect(result.toolCalls.single.arguments, {'query': 'smile'});
    expect(result.usage.input, 80);
    expect(result.usage.cacheRead, 20);
    expect(result.usage.output, 20);
    expect(result.usage.reasoning, 10);
    expect(result.usage.total, 130);
    expect(received.single['stream'], isTrue);
    expect(received.single['stream_options'], {'include_usage': true});
    expect(received.single['reasoning_effort'], 'high');
  });

  test('retries without reasoning effort when a legacy gateway rejects it',
      () async {
    final bodies = <Map<String, dynamic>>[];
    final client = AgentProviderClient(clientFactory: (settings, uri) async {
      return _ScriptedClient((request) async {
        final body = Map<String, dynamic>.from(
          jsonDecode((request as http.Request).body) as Map,
        );
        bodies.add(body);
        if (body.containsKey('reasoning_effort')) {
          return _response(
            400,
            jsonEncode({
              'error': {'message': 'unsupported reasoning_effort parameter'}
            }),
          );
        }
        return _response(
          200,
          jsonEncode({
            'choices': [
              {
                'message': {'content': 'compatible fallback'}
              }
            ],
            'usage': {'prompt_tokens': 3, 'completion_tokens': 2},
          }),
        );
      });
    });

    final result = await client.complete(
      settings: AppSettings(
        agentApiProtocol: 'openai-compatible',
        agentApiBaseUrl: 'https://provider.invalid/v1',
        agentApiModel: 'legacy-model',
      ),
      apiKey: 'test-key',
      messages: const [
        {'role': 'user', 'content': 'plan an image'},
      ],
      tools: const [],
      generationConfig: const {'reasoningEffort': 'high'},
      onDelta: (_) {},
    );

    expect(bodies, hasLength(2));
    expect(bodies.first['reasoning_effort'], 'high');
    expect(bodies.last.containsKey('reasoning_effort'), isFalse);
    expect(result.content, 'compatible fallback');
  });

  test('falls back when a compatible gateway rejects stream options', () async {
    var requests = 0;
    final client = AgentProviderClient(clientFactory: (settings, uri) async {
      return _ScriptedClient((request) async {
        requests++;
        final body = Map<String, dynamic>.from(
          jsonDecode((request as http.Request).body) as Map,
        );
        if (body['stream_options'] != null) {
          return _response(
            400,
            jsonEncode({
              'error': {'message': 'stream_options is unsupported'}
            }),
          );
        }
        expect(body['stream'], isFalse);
        return _response(
          200,
          jsonEncode({
            'choices': [
              {
                'message': {'content': 'fallback ok'}
              }
            ],
            'usage': {
              'prompt_tokens': 4,
              'completion_tokens': 2,
              'total_tokens': 6,
            },
          }),
        );
      });
    });

    final result = await client.complete(
      settings: AppSettings(
        agentApiProtocol: 'openai-compatible',
        agentApiBaseUrl: 'https://provider.invalid/v1',
        agentApiModel: 'test-model',
      ),
      apiKey: 'test-key',
      messages: const [
        {'role': 'user', 'content': 'hello'},
      ],
      tools: const [],
      onDelta: (_) {},
    );

    expect(requests, 2);
    expect(result.content, 'fallback ok');
    expect(result.usage.total, 6);
  });

  test('supports OpenAI Responses messages, vision parts, and tool calls',
      () async {
    Map<String, dynamic>? requestBody;
    final client = AgentProviderClient(clientFactory: (settings, uri) async {
      expect(uri.path, '/v1/responses');
      return _ScriptedClient((request) async {
        requestBody = Map<String, dynamic>.from(
          jsonDecode((request as http.Request).body) as Map,
        );
        return _response(
          200,
          jsonEncode({
            'output': [
              {
                'type': 'message',
                'content': [
                  {'type': 'output_text', 'text': '先检索标签。'}
                ],
              },
              {
                'type': 'function_call',
                'call_id': 'response-call',
                'name': 'langbai_search_tags',
                'arguments': '{"query":"smile"}',
              },
            ],
            'usage': {
              'input_tokens': 50,
              'output_tokens': 12,
              'total_tokens': 62,
            },
          }),
        );
      });
    });

    final result = await client.complete(
      settings: AppSettings(
        agentApiProtocol: 'openai-responses',
        agentApiBaseUrl: 'https://provider.invalid/v1',
        agentApiModel: 'responses-model',
      ),
      apiKey: 'test-key',
      messages: const [
        {'role': 'system', 'content': 'system guide'},
        {
          'role': 'user',
          'content': [
            {'type': 'text', 'text': 'look'},
            {
              'type': 'image_url',
              'image_url': {'url': 'data:image/png;base64,AA=='}
            },
          ],
        },
      ],
      tools: const [
        {
          'type': 'function',
          'function': {
            'name': 'langbai_search_tags',
            'description': 'search',
            'parameters': {'type': 'object'},
          },
        },
      ],
      generationConfig: const {'reasoningEffort': 'medium'},
      onDelta: (_) {},
    );

    expect(requestBody?['instructions'], 'system guide');
    expect(requestBody?['reasoning'], {'effort': 'medium'});
    final input = requestBody?['input'] as List;
    final content = (input.single as Map)['content'] as List;
    expect((content.last as Map)['type'], 'input_image');
    expect(result.content, '先检索标签。');
    expect(result.toolCalls.single.id, 'response-call');
    expect(result.toolCalls.single.arguments, {'query': 'smile'});
    expect(result.usage.total, 62);
  });

  test('supports Anthropic Messages with native tool blocks', () async {
    Map<String, dynamic>? body;
    final client = AgentProviderClient(clientFactory: (settings, uri) async {
      expect(uri.path, '/v1/messages');
      return _ScriptedClient((request) async {
        expect(request.headers['x-api-key'], 'anthropic-key');
        body = Map<String, dynamic>.from(
          jsonDecode((request as http.Request).body) as Map,
        );
        return _response(
            200,
            jsonEncode({
              'content': [
                {'type': 'text', 'text': '调用工具'},
                {
                  'type': 'tool_use',
                  'id': 'a-1',
                  'name': 'langbai_search_tags',
                  'input': {'query': 'smile'}
                },
              ],
              'usage': {'input_tokens': 20, 'output_tokens': 8},
            }));
      });
    });
    final result = await client.complete(
      settings: AppSettings(
          agentApiProtocol: 'anthropic-messages',
          agentApiBaseUrl: 'https://api.anthropic.com',
          agentApiModel: 'claude-test'),
      apiKey: 'anthropic-key',
      messages: const [
        {'role': 'system', 'content': 'guide'},
        {'role': 'user', 'content': 'hello'}
      ],
      tools: const [
        {
          'type': 'function',
          'function': {
            'name': 'langbai_search_tags',
            'description': 'search',
            'parameters': {'type': 'object'}
          }
        }
      ],
      onDelta: (_) {},
    );
    expect(body?['system'], 'guide');
    expect(result.content, '调用工具');
    expect(result.toolCalls.single.arguments, {'query': 'smile'});
    expect(result.usage.total, 28);
  });

  test('supports Gemini GenerateContent and function calls', () async {
    Map<String, dynamic>? body;
    final client = AgentProviderClient(clientFactory: (settings, uri) async {
      expect(uri.path, '/v1beta/models/gemini-test:generateContent');
      return _ScriptedClient((request) async {
        expect(request.headers['x-goog-api-key'], 'gemini-key');
        body = Map<String, dynamic>.from(
            jsonDecode((request as http.Request).body) as Map);
        return _response(
            200,
            jsonEncode({
              'candidates': [
                {
                  'content': {
                    'parts': [
                      {'text': '先检索'},
                      {
                        'functionCall': {
                          'name': 'langbai_search_tags',
                          'args': {'query': 'smile'}
                        }
                      },
                    ]
                  }
                }
              ],
              'usageMetadata': {
                'promptTokenCount': 10,
                'candidatesTokenCount': 5,
                'totalTokenCount': 15
              },
            }));
      });
    });
    final result = await client.complete(
      settings: AppSettings(
          agentApiProtocol: 'google-gemini',
          agentApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          agentApiModel: 'gemini-test'),
      apiKey: 'gemini-key',
      messages: const [
        {'role': 'system', 'content': 'guide'},
        {'role': 'user', 'content': 'hello'}
      ],
      tools: const [
        {
          'type': 'function',
          'function': {
            'name': 'langbai_search_tags',
            'description': 'search',
            'parameters': {'type': 'object'}
          }
        }
      ],
      onDelta: (_) {},
    );
    expect(body?['systemInstruction'], isNotNull);
    expect(result.content, '先检索');
    expect(result.toolCalls.single.name, 'langbai_search_tags');
    expect(result.usage.total, 15);
  });
}
