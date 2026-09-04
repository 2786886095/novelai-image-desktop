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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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
