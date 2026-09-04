import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/nai_models.dart';
import '../services/proxy_http_client.dart';
import 'agent_models.dart';
import 'agent_provider_catalog.dart';

class AgentProviderException implements Exception {
  final String message;
  final int? statusCode;
  const AgentProviderException(this.message, [this.statusCode]);

  @override
  String toString() => message;
}

class AgentProviderToolCall {
  final String id;
  final String name;
  final Map<String, dynamic> arguments;

  const AgentProviderToolCall({
    required this.id,
    required this.name,
    required this.arguments,
  });
}

class AgentProviderTurn {
  final String content;
  final String reasoning;
  final List<AgentProviderToolCall> toolCalls;
  final AgentTokenUsage usage;

  const AgentProviderTurn({
    this.content = '',
    this.reasoning = '',
    this.toolCalls = const [],
    required this.usage,
  });
}

class _ToolAccumulator {
  String id = '';
  String name = '';
  String arguments = '';
}

typedef AgentHttpClientFactory = Future<http.Client> Function(
  AppSettings settings,
  Uri uri,
);

class AgentProviderClient {
  final AgentHttpClientFactory? clientFactory;
  http.Client? _activeClient;
  bool _aborted = false;

  AgentProviderClient({this.clientFactory});

  void abort() {
    _aborted = true;
    _activeClient?.close();
    _activeClient = null;
  }

  Uri _endpoint(String baseUrl, String suffix) {
    var normalized = baseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (normalized.isEmpty) {
      throw const AgentProviderException('请先配置 Agent API 地址。');
    }
    if (normalized.endsWith(suffix)) return Uri.parse(normalized);
    if (RegExp(r'/v\d+(?:beta)?$').hasMatch(normalized) &&
        RegExp(r'^/v\d+(?:beta)?/').hasMatch(suffix)) {
      suffix = suffix.replaceFirst(RegExp(r'^/v\d+(?:beta)?'), '');
    }
    return Uri.parse('$normalized$suffix');
  }

  Map<String, String> _headers(String apiKey) => {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        if (apiKey.trim().isNotEmpty) 'Authorization': 'Bearer $apiKey',
        'User-Agent': 'Langbai-NovelAI-Studio-Mobile-Agent/1',
      };

  Future<AgentProviderTurn> complete({
    required AppSettings settings,
    required String apiKey,
    required List<Map<String, dynamic>> messages,
    required List<Map<String, dynamic>> tools,
    required void Function(String delta) onDelta,
    bool toolsEnabled = true,
    Map<String, dynamic>? generationConfig,
  }) async {
    _aborted = false;
    if (agentApiKeyRequired(
            settings.agentApiProtocol, settings.agentApiBaseUrl) &&
        apiKey.trim().isEmpty) {
      throw const AgentProviderException('请先配置 Agent API Key。');
    }
    if (settings.agentApiModel.trim().isEmpty) {
      throw const AgentProviderException('请先配置 Agent 模型名称。');
    }
    if (settings.agentApiProtocol == 'openai-responses') {
      return _responses(
        settings: settings,
        apiKey: apiKey,
        messages: messages,
        tools: tools,
        toolsEnabled: toolsEnabled,
        onDelta: onDelta,
        generationConfig: generationConfig,
      );
    }
    if (settings.agentApiProtocol == 'anthropic-messages') {
      return _anthropic(
        settings: settings,
        apiKey: apiKey,
        messages: messages,
        tools: tools,
        toolsEnabled: toolsEnabled,
        onDelta: onDelta,
        generationConfig: generationConfig,
      );
    }
    if (settings.agentApiProtocol == 'google-gemini') {
      return _gemini(
        settings: settings,
        apiKey: apiKey,
        messages: messages,
        tools: tools,
        toolsEnabled: toolsEnabled,
        onDelta: onDelta,
        generationConfig: generationConfig,
      );
    }
    return _chatCompletions(
      settings: settings,
      apiKey: apiKey,
      messages: messages,
      tools: tools,
      toolsEnabled: toolsEnabled,
      onDelta: onDelta,
      generationConfig: generationConfig,
    );
  }

  AgentDiscoveredModel _modelMetadata(Map<String, dynamic> raw) {
    final id =
        (raw['id'] ?? raw['name'] ?? '').toString().replaceFirst('models/', '');
    final known = <String, List<Object>>{
      'deepseek-v4-flash': [1048576, 393216, 32768, false],
      'deepseek-v4-pro': [1048576, 393216, 32768, false],
      'gpt-5.6-terra': [1050000, 131072, 32768, true],
      'gpt-5.6-sol': [1050000, 131072, 32768, true],
      'claude-sonnet-5': [1000000, 131072, 32768, true],
      'claude-opus-5': [1000000, 131072, 32768, true],
      'gemini-3.7-flash': [1048576, 65536, 32768, true],
    }[id.toLowerCase()];
    int? number(Iterable<Object?> values) {
      for (final value in values) {
        final parsed = value is num ? value.round() : int.tryParse('$value');
        if (parsed != null && parsed > 0) return parsed;
      }
      return null;
    }

    final context = number([
      raw['context_window'],
      raw['context_length'],
      raw['max_input_tokens'],
      raw['inputTokenLimit'],
      if (known != null) known[0]
    ]);
    final output = number([
      raw['max_output_tokens'],
      raw['outputTokenLimit'],
      raw['max_tokens'],
      if (known != null) known[1]
    ]);
    return AgentDiscoveredModel(
      id: id,
      displayName: (raw['display_name'] ?? raw['displayName'] ?? id).toString(),
      contextWindow: context,
      maxOutputTokens: output,
      suggestedOutputTokens:
          known == null ? output?.clamp(512, 32768) : known[2] as int,
      vision: raw['vision'] is bool
          ? raw['vision'] as bool
          : known == null
              ? null
              : known[3] as bool,
    );
  }

  Future<List<AgentDiscoveredModel>> discoverModels({
    required AppSettings settings,
    required String apiKey,
    required String protocol,
    required String baseUrl,
  }) async {
    if (agentApiKeyRequired(protocol, baseUrl) && apiKey.trim().isEmpty) {
      throw const AgentProviderException('请先配置 Agent API Key。');
    }
    final uri = protocol == 'anthropic-messages'
        ? _endpoint(baseUrl, '/v1/models')
        : _endpoint(baseUrl, '/models');
    final client = clientFactory != null
        ? await clientFactory!(settings, uri)
        : await createProxyHttpClientForUri(settings, uri,
            scope: ProxyScope.ai);
    _activeClient = client;
    final headers = <String, String>{'Accept': 'application/json'};
    if (protocol == 'anthropic-messages') {
      headers.addAll({'x-api-key': apiKey, 'anthropic-version': '2023-06-01'});
    } else if (protocol == 'google-gemini') {
      headers['x-goog-api-key'] = apiKey;
    } else if (apiKey.trim().isNotEmpty) {
      headers['Authorization'] = 'Bearer $apiKey';
    }
    final response = await client
        .send(http.Request('GET', uri)..headers.addAll(headers))
        .timeout(const Duration(seconds: 20));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = await _readError(response);
      client.close();
      _activeClient = null;
      throw AgentProviderException(message, response.statusCode);
    }
    final decoded = jsonDecode(await response.stream.bytesToString());
    client.close();
    _activeClient = null;
    final map = decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : const <String, dynamic>{};
    final values = decoded is List
        ? decoded
        : map['data'] is List
            ? map['data'] as List
            : map['models'] is List
                ? map['models'] as List
                : const [];
    final models = <AgentDiscoveredModel>[];
    for (final value in values) {
      final raw = value is String
          ? <String, dynamic>{'id': value}
          : value is Map
              ? Map<String, dynamic>.from(value)
              : null;
      if (raw == null) continue;
      final model = _modelMetadata(raw);
      final methods = raw['supportedGenerationMethods'] is List
          ? (raw['supportedGenerationMethods'] as List)
              .map((item) => item.toString())
          : const <String>[];
      if (methods.isNotEmpty &&
          !methods.any((item) => item.contains('generateContent'))) continue;
      if (RegExp(
              r'(embedding|moderation|rerank|whisper|tts|speech|realtime|image-generation|video)',
              caseSensitive: false)
          .hasMatch(model.id)) continue;
      models.add(model);
    }
    models.sort((a, b) => a.displayName.compareTo(b.displayName));
    return models;
  }

  Future<http.StreamedResponse> _send(
    AppSettings settings,
    Uri uri,
    String apiKey,
    Map<String, dynamic> body, {
    Map<String, String> extraHeaders = const {},
  }) async {
    final client = clientFactory != null
        ? await clientFactory!(settings, uri)
        : await createProxyHttpClientForUri(
            settings,
            uri,
            scope: ProxyScope.ai,
          );
    _activeClient = client;
    final request = http.Request('POST', uri)
      ..headers.addAll({..._headers(apiKey), ...extraHeaders})
      ..body = jsonEncode(body);
    try {
      return await client.send(request).timeout(const Duration(seconds: 90));
    } catch (error) {
      client.close();
      if (_aborted) throw const AgentProviderException('Agent 请求已停止。');
      rethrow;
    }
  }

  Future<String> _readError(http.StreamedResponse response) async {
    final body = await response.stream.bytesToString();
    try {
      final json = jsonDecode(body);
      if (json is Map) {
        final error = json['error'];
        if (error is Map && error['message'] != null) {
          return error['message'].toString();
        }
        if (json['message'] != null) return json['message'].toString();
      }
    } catch (_) {}
    return body.trim().isEmpty ? 'HTTP ${response.statusCode}' : body.trim();
  }

  AgentTokenUsage _usage(Object? raw) {
    if (raw is! Map) return AgentTokenUsage(estimated: true);
    final json = Map<String, dynamic>.from(raw);
    final rawInput =
        ((json['prompt_tokens'] ?? json['input_tokens']) as num?)?.round() ?? 0;
    final rawOutput =
        ((json['completion_tokens'] ?? json['output_tokens']) as num?)
                ?.round() ??
            0;
    final inputDetails = json['prompt_tokens_details'] is Map
        ? Map<String, dynamic>.from(json['prompt_tokens_details'])
        : json['input_tokens_details'] is Map
            ? Map<String, dynamic>.from(json['input_tokens_details'])
            : const <String, dynamic>{};
    final outputDetails = json['completion_tokens_details'] is Map
        ? Map<String, dynamic>.from(json['completion_tokens_details'])
        : json['output_tokens_details'] is Map
            ? Map<String, dynamic>.from(json['output_tokens_details'])
            : const <String, dynamic>{};
    final cacheRead = ((inputDetails['cached_tokens'] as num?)?.round() ?? 0)
        .clamp(0, rawInput)
        .toInt();
    final reasoning =
        ((outputDetails['reasoning_tokens'] as num?)?.round() ?? 0)
            .clamp(0, rawOutput)
            .toInt();
    final cacheWrite =
        (inputDetails['cache_creation_tokens'] as num?)?.round() ?? 0;
    return AgentTokenUsage(
      // OpenAI includes cached input and reasoning output in the headline
      // counters. Keep the UI categories mutually exclusive so their sum is
      // meaningful and context usage is not double counted.
      input: (rawInput - cacheRead).clamp(0, rawInput).toInt(),
      output: (rawOutput - reasoning).clamp(0, rawOutput).toInt(),
      reasoning: reasoning,
      cacheRead: cacheRead,
      cacheWrite: cacheWrite.clamp(0, 1 << 31).toInt(),
      total: (json['total_tokens'] as num?)?.round(),
      estimated: false,
    );
  }

  Map<String, dynamic> _decodeArguments(String raw) {
    if (raw.trim().isEmpty) return <String, dynamic>{};
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map
          ? Map<String, dynamic>.from(decoded)
          : <String, dynamic>{};
    } catch (_) {
      throw AgentProviderException('模型返回了无效的工具参数：$raw');
    }
  }

  List<Map<String, dynamic>> _anthropicContent(Object? content) {
    if (content is String) {
      return [
        {'type': 'text', 'text': content}
      ];
    }
    final result = <Map<String, dynamic>>[];
    for (final value in content is List ? content : const []) {
      if (value is! Map) continue;
      final part = Map<String, dynamic>.from(value);
      if (part['type'] == 'text') {
        result.add({'type': 'text', 'text': part['text']?.toString() ?? ''});
      } else if (part['type'] == 'image_url') {
        final raw = part['image_url'] is Map
            ? (part['image_url'] as Map)['url']?.toString() ?? ''
            : '';
        final match = RegExp(r'^data:([^;]+);base64,(.+)$').firstMatch(raw);
        if (match != null) {
          result.add({
            'type': 'image',
            'source': {
              'type': 'base64',
              'media_type': match.group(1),
              'data': match.group(2)
            }
          });
        }
      }
    }
    return result;
  }

  Future<AgentProviderTurn> _anthropic({
    required AppSettings settings,
    required String apiKey,
    required List<Map<String, dynamic>> messages,
    required List<Map<String, dynamic>> tools,
    required bool toolsEnabled,
    required void Function(String delta) onDelta,
    Map<String, dynamic>? generationConfig,
  }) async {
    final system = messages
        .where((item) => item['role'] == 'system')
        .map((item) => item['content']?.toString() ?? '')
        .where((item) => item.isNotEmpty)
        .join('\n\n');
    final converted = <Map<String, dynamic>>[];
    for (final message in messages.where((item) => item['role'] != 'system')) {
      final role = message['role']?.toString();
      if (role == 'tool') {
        converted.add({
          'role': 'user',
          'content': [
            {
              'type': 'tool_result',
              'tool_use_id': message['tool_call_id'],
              'content': message['content']?.toString() ?? ''
            }
          ]
        });
        continue;
      }
      final content = _anthropicContent(message['content']);
      if (role == 'assistant') {
        for (final value in message['tool_calls'] as List? ?? const []) {
          if (value is! Map) continue;
          final raw = Map<String, dynamic>.from(value);
          final function = raw['function'] is Map
              ? Map<String, dynamic>.from(raw['function'] as Map)
              : const <String, dynamic>{};
          content.add({
            'type': 'tool_use',
            'id': raw['id'] ?? agentId('call'),
            'name': function['name'],
            'input': _decodeArguments(function['arguments']?.toString() ?? '{}')
          });
        }
      }
      converted.add({
        'role': role == 'assistant' ? 'assistant' : 'user',
        'content': content
      });
    }
    final anthropicTools = toolsEnabled
        ? tools.map((item) {
            final function = Map<String, dynamic>.from(item['function'] as Map);
            return {
              'name': function['name'],
              'description': function['description'],
              'input_schema': function['parameters']
            };
          }).toList()
        : const <Map<String, dynamic>>[];
    final response = await _send(
        settings, _endpoint(settings.agentApiBaseUrl, '/v1/messages'), apiKey, {
      'model': settings.agentApiModel.trim(),
      'max_tokens':
          generationConfig?['maxOutputTokens'] ?? settings.agentMaxOutputTokens,
      if (generationConfig?['temperature'] != null)
        'temperature': generationConfig!['temperature'],
      if (generationConfig?['topP'] != null) 'top_p': generationConfig!['topP'],
      if (generationConfig?['stop'] is List &&
          (generationConfig!['stop'] as List).isNotEmpty)
        'stop_sequences': generationConfig['stop'],
      if (system.isNotEmpty) 'system': system,
      'messages': converted,
      if (anthropicTools.isNotEmpty) 'tools': anthropicTools,
    },
        extraHeaders: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = await _readError(response);
      _activeClient?.close();
      _activeClient = null;
      throw AgentProviderException(message, response.statusCode);
    }
    final decoded = jsonDecode(await response.stream.bytesToString());
    _activeClient?.close();
    _activeClient = null;
    if (decoded is! Map) throw const AgentProviderException('模型返回格式无效。');
    final payload = Map<String, dynamic>.from(decoded);
    final content = StringBuffer();
    final calls = <AgentProviderToolCall>[];
    for (final value in payload['content'] as List? ?? const []) {
      if (value is! Map) continue;
      final item = Map<String, dynamic>.from(value);
      if (item['type'] == 'text') {
        content.write(item['text']?.toString() ?? '');
      }
      if (item['type'] == 'tool_use' && item['name'] != null) {
        calls.add(AgentProviderToolCall(
            id: item['id']?.toString() ?? agentId('call'),
            name: item['name'].toString(),
            arguments: item['input'] is Map
                ? Map<String, dynamic>.from(item['input'] as Map)
                : const {}));
      }
    }
    final text = content.toString();
    if (text.isNotEmpty) onDelta(text);
    final usageRaw = payload['usage'] is Map
        ? Map<String, dynamic>.from(payload['usage'] as Map)
        : const <String, dynamic>{};
    final input = (usageRaw['input_tokens'] as num?)?.round() ?? 0;
    final output = (usageRaw['output_tokens'] as num?)?.round() ?? 0;
    final cacheRead =
        (usageRaw['cache_read_input_tokens'] as num?)?.round() ?? 0;
    return AgentProviderTurn(
        content: text,
        toolCalls: calls,
        usage: AgentTokenUsage(
            input: input,
            output: output,
            cacheRead: cacheRead,
            total: input + output,
            estimated: false));
  }

  List<Map<String, dynamic>> _geminiParts(Object? content) {
    if (content is String) {
      return [
        {'text': content}
      ];
    }
    final result = <Map<String, dynamic>>[];
    for (final value in content is List ? content : const []) {
      if (value is! Map) continue;
      final part = Map<String, dynamic>.from(value);
      if (part['type'] == 'text') {
        result.add({'text': part['text']?.toString() ?? ''});
      }
      if (part['type'] == 'image_url') {
        final raw = part['image_url'] is Map
            ? (part['image_url'] as Map)['url']?.toString() ?? ''
            : '';
        final match = RegExp(r'^data:([^;]+);base64,(.+)$').firstMatch(raw);
        if (match != null) {
          result.add({
            'inlineData': {'mimeType': match.group(1), 'data': match.group(2)}
          });
        }
      }
    }
    return result;
  }

  Future<AgentProviderTurn> _gemini({
    required AppSettings settings,
    required String apiKey,
    required List<Map<String, dynamic>> messages,
    required List<Map<String, dynamic>> tools,
    required bool toolsEnabled,
    required void Function(String delta) onDelta,
    Map<String, dynamic>? generationConfig,
  }) async {
    final system = messages
        .where((item) => item['role'] == 'system')
        .map((item) => item['content']?.toString() ?? '')
        .where((item) => item.isNotEmpty)
        .join('\n\n');
    final callNames = <String, String>{};
    final contents = <Map<String, dynamic>>[];
    for (final message in messages.where((item) => item['role'] != 'system')) {
      final role = message['role']?.toString();
      if (role == 'tool') {
        final id = message['tool_call_id']?.toString() ?? '';
        final rawResponse = message['content']?.toString() ?? '';
        Object responseValue;
        try {
          responseValue = jsonDecode(rawResponse);
        } catch (_) {
          responseValue = {'result': rawResponse};
        }
        contents.add({
          'role': 'user',
          'parts': [
            {
              'functionResponse': {
                'name': callNames[id] ?? 'tool',
                'response': responseValue
              }
            }
          ]
        });
        continue;
      }
      final parts = _geminiParts(message['content']);
      if (role == 'assistant') {
        for (final value in message['tool_calls'] as List? ?? const []) {
          if (value is! Map) continue;
          final raw = Map<String, dynamic>.from(value);
          final function = raw['function'] is Map
              ? Map<String, dynamic>.from(raw['function'] as Map)
              : const <String, dynamic>{};
          final id = raw['id']?.toString() ?? agentId('call');
          final name = function['name']?.toString() ?? 'tool';
          callNames[id] = name;
          parts.add({
            'functionCall': {
              'name': name,
              'args':
                  _decodeArguments(function['arguments']?.toString() ?? '{}')
            }
          });
        }
      }
      contents.add(
          {'role': role == 'assistant' ? 'model' : 'user', 'parts': parts});
    }
    final declarations = toolsEnabled
        ? tools.map((item) {
            final function = Map<String, dynamic>.from(item['function'] as Map);
            return {
              'name': function['name'],
              'description': function['description'],
              'parameters': function['parameters']
            };
          }).toList()
        : const <Map<String, dynamic>>[];
    final modelId = Uri.encodeComponent(settings.agentApiModel.trim());
    final response = await _send(
        settings,
        _endpoint(settings.agentApiBaseUrl, '/models/$modelId:generateContent'),
        apiKey, {
      if (system.isNotEmpty)
        'systemInstruction': {
          'parts': [
            {'text': system}
          ]
        },
      'contents': contents,
      'generationConfig': {
        'maxOutputTokens': generationConfig?['maxOutputTokens'] ??
            settings.agentMaxOutputTokens,
        if (generationConfig?['temperature'] != null)
          'temperature': generationConfig!['temperature'],
        if (generationConfig?['topP'] != null)
          'topP': generationConfig!['topP'],
        if (generationConfig?['stop'] is List &&
            (generationConfig!['stop'] as List).isNotEmpty)
          'stopSequences': generationConfig['stop'],
      },
      if (declarations.isNotEmpty)
        'tools': [
          {'functionDeclarations': declarations}
        ],
    },
        extraHeaders: {
          'x-goog-api-key': apiKey
        });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = await _readError(response);
      _activeClient?.close();
      _activeClient = null;
      throw AgentProviderException(message, response.statusCode);
    }
    final decoded = jsonDecode(await response.stream.bytesToString());
    _activeClient?.close();
    _activeClient = null;
    if (decoded is! Map) throw const AgentProviderException('模型返回格式无效。');
    final payload = Map<String, dynamic>.from(decoded);
    final candidates = payload['candidates'] as List? ?? const [];
    final first = candidates.whereType<Map>().firstOrNull;
    final responseContent = first?['content'] is Map
        ? Map<String, dynamic>.from(first!['content'] as Map)
        : const <String, dynamic>{};
    final text = StringBuffer();
    final calls = <AgentProviderToolCall>[];
    for (final value in responseContent['parts'] as List? ?? const []) {
      if (value is! Map) continue;
      final part = Map<String, dynamic>.from(value);
      if (part['text'] != null) text.write(part['text'].toString());
      if (part['functionCall'] is Map) {
        final call = Map<String, dynamic>.from(part['functionCall'] as Map);
        if (call['name'] != null) {
          calls.add(AgentProviderToolCall(
              id: agentId('call'),
              name: call['name'].toString(),
              arguments: call['args'] is Map
                  ? Map<String, dynamic>.from(call['args'] as Map)
                  : const {}));
        }
      }
    }
    final outputText = text.toString();
    if (outputText.isNotEmpty) onDelta(outputText);
    final usage = payload['usageMetadata'] is Map
        ? Map<String, dynamic>.from(payload['usageMetadata'] as Map)
        : const <String, dynamic>{};
    final input = (usage['promptTokenCount'] as num?)?.round() ?? 0;
    final output = (usage['candidatesTokenCount'] as num?)?.round() ?? 0;
    final reasoning = (usage['thoughtsTokenCount'] as num?)?.round() ?? 0;
    final cacheRead = (usage['cachedContentTokenCount'] as num?)?.round() ?? 0;
    return AgentProviderTurn(
        content: outputText,
        toolCalls: calls,
        usage: AgentTokenUsage(
            input: input,
            output: output,
            reasoning: reasoning,
            cacheRead: cacheRead,
            total: (usage['totalTokenCount'] as num?)?.round() ??
                input + output + reasoning,
            estimated: false));
  }

  AgentProviderTurn _parseChatJson(
    Map<String, dynamic> payload,
    void Function(String delta) onDelta,
  ) {
    final choices = payload['choices'] as List? ?? const [];
    final first = choices.whereType<Map>().firstOrNull;
    final message = first?['message'] is Map
        ? Map<String, dynamic>.from(first!['message'] as Map)
        : <String, dynamic>{};
    final content = message['content']?.toString() ?? '';
    final reasoning =
        (message['reasoning_content'] ?? message['reasoning'])?.toString() ??
            '';
    if (content.isNotEmpty) onDelta(content);
    final calls = <AgentProviderToolCall>[];
    for (final value in message['tool_calls'] as List? ?? const []) {
      if (value is! Map) continue;
      final raw = Map<String, dynamic>.from(value);
      final function = raw['function'] is Map
          ? Map<String, dynamic>.from(raw['function'] as Map)
          : const <String, dynamic>{};
      final name = function['name']?.toString() ?? '';
      if (name.isEmpty) continue;
      calls.add(AgentProviderToolCall(
        id: raw['id']?.toString() ?? agentId('call'),
        name: name,
        arguments: _decodeArguments(function['arguments']?.toString() ?? ''),
      ));
    }
    return AgentProviderTurn(
      content: content,
      reasoning: reasoning,
      toolCalls: calls,
      usage: _usage(payload['usage']),
    );
  }

  Future<AgentProviderTurn> _chatCompletions({
    required AppSettings settings,
    required String apiKey,
    required List<Map<String, dynamic>> messages,
    required List<Map<String, dynamic>> tools,
    required bool toolsEnabled,
    required void Function(String delta) onDelta,
    Map<String, dynamic>? generationConfig,
  }) async {
    final uri = _endpoint(settings.agentApiBaseUrl, '/chat/completions');
    final body = <String, dynamic>{
      'model': settings.agentApiModel.trim(),
      'messages': messages,
      'stream': true,
      'stream_options': {'include_usage': true},
      'max_tokens':
          generationConfig?['maxOutputTokens'] ?? settings.agentMaxOutputTokens,
      if (generationConfig?['temperature'] != null)
        'temperature': generationConfig!['temperature'],
      if (generationConfig?['topP'] != null) 'top_p': generationConfig!['topP'],
      if (generationConfig?['frequencyPenalty'] != null)
        'frequency_penalty': generationConfig!['frequencyPenalty'],
      if (generationConfig?['presencePenalty'] != null)
        'presence_penalty': generationConfig!['presencePenalty'],
      if (generationConfig?['stop'] is List &&
          (generationConfig!['stop'] as List).isNotEmpty)
        'stop': generationConfig['stop'],
      if (generationConfig?['reasoningEffort'] != null &&
          generationConfig!['reasoningEffort'] != 'auto')
        'reasoning_effort': generationConfig['reasoningEffort'],
      if (toolsEnabled && tools.isNotEmpty) ...{
        'tools': tools,
        'tool_choice': 'auto',
      },
    };
    var response = await _send(settings, uri, apiKey, body);
    var retriedReasoning = false;
    var retriedStreaming = false;
    while (response.statusCode < 200 || response.statusCode >= 300) {
      final message = await _readError(response);
      _activeClient?.close();
      _activeClient = null;
      final lower = message.toLowerCase();
      if (!retriedReasoning &&
          response.statusCode == 400 &&
          body.containsKey('reasoning_effort') &&
          (lower.contains('reasoning') ||
              lower.contains('unknown field') ||
              lower.contains('unknown parameter') ||
              lower.contains('unsupported field') ||
              lower.contains('unsupported parameter'))) {
        retriedReasoning = true;
        body.remove('reasoning_effort');
        response = await _send(settings, uri, apiKey, body);
        continue;
      }
      // Some OpenAI-compatible gateways reject streaming options while still
      // supporting the otherwise identical Chat Completions contract.
      if (!retriedStreaming &&
          response.statusCode == 400 &&
          (lower.contains('stream') || lower.contains('stream_options'))) {
        retriedStreaming = true;
        body
          ..['stream'] = false
          ..remove('stream_options');
        response = await _send(settings, uri, apiKey, body);
        continue;
      } else {
        throw AgentProviderException(message, response.statusCode);
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = await _readError(response);
      _activeClient?.close();
      _activeClient = null;
      throw AgentProviderException(message, response.statusCode);
    }

    final contentType = response.headers['content-type']?.toLowerCase() ?? '';
    if (!contentType.contains('text/event-stream') && body['stream'] == false) {
      final payload = jsonDecode(await response.stream.bytesToString());
      _activeClient?.close();
      _activeClient = null;
      if (payload is! Map) throw const AgentProviderException('模型返回格式无效。');
      return _parseChatJson(Map<String, dynamic>.from(payload), onDelta);
    }

    final content = StringBuffer();
    final reasoning = StringBuffer();
    final toolParts = <int, _ToolAccumulator>{};
    var usage = AgentTokenUsage(estimated: true);
    final rawFallback = StringBuffer();
    try {
      await for (final line in response.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())) {
        if (_aborted) throw const AgentProviderException('Agent 请求已停止。');
        if (line.trim().isEmpty) continue;
        final data =
            line.startsWith('data:') ? line.substring(5).trim() : line.trim();
        if (data == '[DONE]') break;
        if (!line.startsWith('data:')) rawFallback.writeln(data);
        dynamic decoded;
        try {
          decoded = jsonDecode(data);
        } catch (_) {
          continue;
        }
        if (decoded is! Map) continue;
        final payload = Map<String, dynamic>.from(decoded);
        if (payload['usage'] is Map) usage = _usage(payload['usage']);
        final choices = payload['choices'] as List? ?? const [];
        for (final choiceValue in choices.whereType<Map>()) {
          final choice = Map<String, dynamic>.from(choiceValue);
          final delta = choice['delta'] is Map
              ? Map<String, dynamic>.from(choice['delta'] as Map)
              : const <String, dynamic>{};
          final text = delta['content']?.toString() ?? '';
          if (text.isNotEmpty) {
            content.write(text);
            onDelta(text);
          }
          final thought =
              (delta['reasoning_content'] ?? delta['reasoning'])?.toString() ??
                  '';
          if (thought.isNotEmpty) reasoning.write(thought);
          for (final callValue in delta['tool_calls'] as List? ?? const []) {
            if (callValue is! Map) continue;
            final call = Map<String, dynamic>.from(callValue);
            final index = (call['index'] as num?)?.round() ?? toolParts.length;
            final part = toolParts.putIfAbsent(index, _ToolAccumulator.new);
            final id = call['id']?.toString() ?? '';
            if (id.isNotEmpty) part.id = id;
            final function = call['function'] is Map
                ? Map<String, dynamic>.from(call['function'] as Map)
                : const <String, dynamic>{};
            final name = function['name']?.toString() ?? '';
            if (name.isNotEmpty) part.name += name;
            part.arguments += function['arguments']?.toString() ?? '';
          }
        }
      }
    } finally {
      _activeClient?.close();
      _activeClient = null;
    }
    if (content.isEmpty && toolParts.isEmpty && rawFallback.isNotEmpty) {
      try {
        final decoded = jsonDecode(rawFallback.toString());
        if (decoded is Map) {
          return _parseChatJson(Map<String, dynamic>.from(decoded), onDelta);
        }
      } catch (_) {}
    }
    final calls = <AgentProviderToolCall>[];
    for (final entry in toolParts.entries.toList()
      ..sort((left, right) => left.key.compareTo(right.key))) {
      final part = entry.value;
      if (part.name.trim().isEmpty) continue;
      calls.add(AgentProviderToolCall(
        id: part.id.isEmpty ? agentId('call') : part.id,
        name: part.name,
        arguments: _decodeArguments(part.arguments),
      ));
    }
    return AgentProviderTurn(
      content: content.toString(),
      reasoning: reasoning.toString(),
      toolCalls: calls,
      usage: usage,
    );
  }

  List<dynamic> _responsesInput(List<Map<String, dynamic>> messages) {
    final output = <dynamic>[];
    for (final message in messages) {
      final role = message['role']?.toString() ?? 'user';
      if (role == 'system') continue;
      if (role == 'tool') {
        output.add({
          'type': 'function_call_output',
          'call_id': message['tool_call_id']?.toString() ?? '',
          'output': message['content']?.toString() ?? '',
        });
        continue;
      }
      if (role == 'assistant' && message['tool_calls'] is List) {
        final text = message['content']?.toString() ?? '';
        if (text.isNotEmpty) output.add({'role': 'assistant', 'content': text});
        for (final value in message['tool_calls'] as List) {
          if (value is! Map) continue;
          final call = Map<String, dynamic>.from(value);
          final function = call['function'] is Map
              ? Map<String, dynamic>.from(call['function'] as Map)
              : const <String, dynamic>{};
          output.add({
            'type': 'function_call',
            'call_id': call['id']?.toString() ?? agentId('call'),
            'name': function['name']?.toString() ?? '',
            'arguments': function['arguments']?.toString() ?? '{}',
          });
        }
        continue;
      }
      final content = message['content'];
      if (content is List) {
        output.add({
          'role': role,
          'content': content.map((part) {
            if (part is! Map) return {'type': 'input_text', 'text': '$part'};
            final item = Map<String, dynamic>.from(part);
            if (item['type'] == 'image_url') {
              final image = item['image_url'];
              final url =
                  image is Map ? image['url']?.toString() : image?.toString();
              return {'type': 'input_image', 'image_url': url ?? ''};
            }
            return {
              'type': 'input_text',
              'text': item['text']?.toString() ?? ''
            };
          }).toList(),
        });
      } else {
        output.add({'role': role, 'content': content?.toString() ?? ''});
      }
    }
    return output;
  }

  Future<AgentProviderTurn> _responses({
    required AppSettings settings,
    required String apiKey,
    required List<Map<String, dynamic>> messages,
    required List<Map<String, dynamic>> tools,
    required bool toolsEnabled,
    required void Function(String delta) onDelta,
    Map<String, dynamic>? generationConfig,
  }) async {
    final uri = _endpoint(settings.agentApiBaseUrl, '/responses');
    final instructions = messages
        .where((item) => item['role'] == 'system')
        .map((item) => item['content']?.toString() ?? '')
        .where((item) => item.isNotEmpty)
        .join('\n\n');
    final responseTools = toolsEnabled
        ? tools.map((item) {
            final function = Map<String, dynamic>.from(item['function'] as Map);
            return {
              'type': 'function',
              'name': function['name'],
              'description': function['description'],
              'parameters': function['parameters'],
            };
          }).toList()
        : const <Map<String, dynamic>>[];
    final effort = generationConfig?['reasoningEffort']?.toString() ?? 'auto';
    final body = <String, dynamic>{
      'model': settings.agentApiModel.trim(),
      'input': _responsesInput(messages),
      if (instructions.isNotEmpty) 'instructions': instructions,
      'max_output_tokens':
          generationConfig?['maxOutputTokens'] ?? settings.agentMaxOutputTokens,
      if (generationConfig?['temperature'] != null)
        'temperature': generationConfig!['temperature'],
      if (generationConfig?['topP'] != null) 'top_p': generationConfig!['topP'],
      if (effort != 'auto') 'reasoning': {'effort': effort},
      if (responseTools.isNotEmpty) 'tools': responseTools,
    };
    var response = await _send(settings, uri, apiKey, body);
    if ((response.statusCode < 200 || response.statusCode >= 300) &&
        response.statusCode == 400 &&
        body.containsKey('reasoning')) {
      final message = await _readError(response);
      _activeClient?.close();
      _activeClient = null;
      final lower = message.toLowerCase();
      if (lower.contains('reasoning') ||
          lower.contains('unknown field') ||
          lower.contains('unknown parameter') ||
          lower.contains('unsupported field') ||
          lower.contains('unsupported parameter')) {
        body.remove('reasoning');
        response = await _send(settings, uri, apiKey, body);
      } else {
        throw AgentProviderException(message, response.statusCode);
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = await _readError(response);
      _activeClient?.close();
      _activeClient = null;
      throw AgentProviderException(message, response.statusCode);
    }
    final decoded = jsonDecode(await response.stream.bytesToString());
    _activeClient?.close();
    _activeClient = null;
    if (decoded is! Map) throw const AgentProviderException('模型返回格式无效。');
    final payload = Map<String, dynamic>.from(decoded);
    final content = StringBuffer();
    final reasoning = StringBuffer();
    final calls = <AgentProviderToolCall>[];
    for (final value in payload['output'] as List? ?? const []) {
      if (value is! Map) continue;
      final item = Map<String, dynamic>.from(value);
      if (item['type'] == 'function_call') {
        calls.add(AgentProviderToolCall(
          id: item['call_id']?.toString() ??
              item['id']?.toString() ??
              agentId('call'),
          name: item['name']?.toString() ?? '',
          arguments: _decodeArguments(item['arguments']?.toString() ?? '{}'),
        ));
        continue;
      }
      for (final partValue in item['content'] as List? ?? const []) {
        if (partValue is! Map) continue;
        final part = Map<String, dynamic>.from(partValue);
        final text = part['text']?.toString() ?? '';
        if (part['type'] == 'reasoning_text' ||
            part['type'] == 'summary_text') {
          reasoning.write(text);
        } else if (text.isNotEmpty) {
          content.write(text);
        }
      }
    }
    if (content.isNotEmpty) onDelta(content.toString());
    return AgentProviderTurn(
      content: content.toString(),
      reasoning: reasoning.toString(),
      toolCalls: calls.where((item) => item.name.isNotEmpty).toList(),
      usage: _usage(payload['usage']),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}
