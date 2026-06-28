import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

const _protocolVersion = '2024-11-05';
const _clientInfo = {'name': 'langbai-novelai-studio', 'version': '1.0.0'};

class _HttpSession {
  String sessionId;
  final String toolName;
  final Map<String, dynamic>? inputSchema;
  DateTime touchedAt;

  _HttpSession({
    required this.sessionId,
    required this.toolName,
    required this.inputSchema,
    required this.touchedAt,
  });
}

final _sessions = <String, _HttpSession>{};

Future<Object?> callMcpTagSearch({
  required http.Client client,
  required String endpoint,
  required String transport,
  required String apiKey,
  required String preferredTool,
  required String query,
  required int limit,
}) {
  if (transport == 'sse') {
    return _callSse(
      client: client,
      endpoint: endpoint,
      apiKey: apiKey,
      preferredTool: preferredTool,
      query: query,
      limit: limit,
    );
  }
  return _callStreamableHttp(
    client: client,
    endpoint: endpoint,
    apiKey: apiKey,
    preferredTool: preferredTool,
    query: query,
    limit: limit,
  );
}

Future<Object?> _callStreamableHttp({
  required http.Client client,
  required String endpoint,
  required String apiKey,
  required String preferredTool,
  required String query,
  required int limit,
}) async {
  final url = endpoint.replaceAll(RegExp(r'/+$'), '');
  final cacheKey = '$url|$preferredTool|$apiKey';
  var sessionId = '';

  Future<Map<String, dynamic>?> post(Map<String, dynamic> body) async {
    final response = await client
        .post(
          Uri.parse(url),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            if (apiKey.trim().isNotEmpty)
              'Authorization': 'Bearer ${apiKey.trim()}',
            if (sessionId.isNotEmpty) 'Mcp-Session-Id': sessionId,
          },
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 20));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('MCP HTTP ${response.statusCode}：${response.body}');
    }
    final returnedSession = response.headers['mcp-session-id'];
    if (returnedSession != null && returnedSession.isNotEmpty) {
      sessionId = returnedSession;
    }
    return _parseRpcBody(response.body);
  }

  final cached = _sessions[cacheKey];
  if (cached != null &&
      DateTime.now().difference(cached.touchedAt) <
          const Duration(minutes: 5)) {
    sessionId = cached.sessionId;
    try {
      final response = await post(_rpc(
          'tools/call',
          {
            'name': cached.toolName,
            'arguments': _buildArgs(cached.inputSchema, query, limit),
          },
          3));
      _throwRpcError(response);
      cached
        ..sessionId = sessionId
        ..touchedAt = DateTime.now();
      return response?['result'];
    } catch (_) {
      _sessions.remove(cacheKey);
      sessionId = '';
    }
  }

  await post(_rpc(
      'initialize',
      {
        'protocolVersion': _protocolVersion,
        'capabilities': <String, dynamic>{},
        'clientInfo': _clientInfo,
      },
      1));
  try {
    await post(_rpc('notifications/initialized'));
  } catch (_) {
    // Some servers answer notifications with an empty 202 or close the body.
  }
  Map<String, dynamic>? schema;
  var toolName = preferredTool.trim().isEmpty ? 'search_tags' : preferredTool;
  try {
    final listed = await post(_rpc('tools/list', <String, dynamic>{}, 2));
    final tools = ((listed?['result'] as Map?)?['tools'] as List?) ?? const [];
    final selected =
        tools.cast<Object?>().whereType<Map>().cast<Map>().firstWhere(
              (tool) => tool['name'] == toolName,
              orElse: () =>
                  tools.isEmpty ? <String, dynamic>{} : tools.first as Map,
            );
    if (selected['name'] is String) toolName = selected['name'] as String;
    if (selected['inputSchema'] is Map) {
      schema = Map<String, dynamic>.from(selected['inputSchema'] as Map);
    }
  } catch (_) {
    // tools/list is optional for narrowly scoped MCP servers.
  }
  final response = await post(_rpc(
      'tools/call',
      {
        'name': toolName,
        'arguments': _buildArgs(schema, query, limit),
      },
      3));
  _throwRpcError(response);
  _sessions[cacheKey] = _HttpSession(
    sessionId: sessionId,
    toolName: toolName,
    inputSchema: schema,
    touchedAt: DateTime.now(),
  );
  return response?['result'];
}

Future<Object?> _callSse({
  required http.Client client,
  required String endpoint,
  required String apiKey,
  required String preferredTool,
  required String query,
  required int limit,
}) async {
  final headers = <String, String>{
    'Accept': 'text/event-stream',
    if (apiKey.trim().isNotEmpty) 'Authorization': 'Bearer ${apiKey.trim()}',
  };
  final request = http.Request('GET', Uri.parse(endpoint))
    ..headers.addAll(headers);
  final streamResponse = await client.send(request);
  if (streamResponse.statusCode < 200 || streamResponse.statusCode >= 300) {
    throw StateError('MCP SSE HTTP ${streamResponse.statusCode}');
  }

  final endpointCompleter = Completer<Uri>();
  final pending = <int, Completer<Map<String, dynamic>>>{};
  var buffer = '';
  late final StreamSubscription<String> subscription;
  subscription = streamResponse.stream.transform(utf8.decoder).listen(
    (chunk) {
      buffer += chunk.replaceAll('\r\n', '\n');
      while (buffer.contains('\n\n')) {
        final split = buffer.indexOf('\n\n');
        final event = buffer.substring(0, split);
        buffer = buffer.substring(split + 2);
        var name = 'message';
        final data = <String>[];
        for (final line in event.split('\n')) {
          if (line.startsWith('event:')) name = line.substring(6).trim();
          if (line.startsWith('data:')) data.add(line.substring(5).trim());
        }
        final body = data.join('\n');
        if (name == 'endpoint' && !endpointCompleter.isCompleted) {
          endpointCompleter.complete(Uri.parse(endpoint).resolve(body));
          continue;
        }
        try {
          final decoded = jsonDecode(body);
          if (decoded is Map && decoded['id'] is num) {
            final id = (decoded['id'] as num).toInt();
            pending.remove(id)?.complete(Map<String, dynamic>.from(decoded));
          }
        } catch (_) {}
      }
    },
    onError: (Object error, StackTrace stack) {
      if (!endpointCompleter.isCompleted) {
        endpointCompleter.completeError(error, stack);
      }
      for (final completer in pending.values) {
        if (!completer.isCompleted) completer.completeError(error, stack);
      }
      pending.clear();
    },
  );

  try {
    final postUri = await endpointCompleter.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () =>
          throw TimeoutException('SSE did not return an endpoint event'),
    );

    Future<Map<String, dynamic>?> send(
      Map<String, dynamic> body, {
      int? responseId,
    }) async {
      Completer<Map<String, dynamic>>? completer;
      if (responseId != null) {
        completer = Completer<Map<String, dynamic>>();
        pending[responseId] = completer;
      }
      final response = await client
          .post(
            postUri,
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 20));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        pending.remove(responseId);
        throw StateError(
            'MCP SSE POST ${response.statusCode}：${response.body}');
      }
      return completer?.future.timeout(const Duration(seconds: 20));
    }

    await send(
      _rpc(
          'initialize',
          {
            'protocolVersion': _protocolVersion,
            'capabilities': <String, dynamic>{},
            'clientInfo': _clientInfo,
          },
          1),
      responseId: 1,
    );
    await send(_rpc('notifications/initialized'));
    Map<String, dynamic>? schema;
    var toolName =
        preferredTool.trim().isEmpty ? 'search_tags' : preferredTool.trim();
    try {
      final listed = await send(
        _rpc('tools/list', <String, dynamic>{}, 2),
        responseId: 2,
      );
      final tools =
          ((listed?['result'] as Map?)?['tools'] as List?) ?? const [];
      final selected = tools.cast<Object?>().whereType<Map>().firstWhere(
            (tool) => tool['name'] == toolName,
            orElse: () => tools.isEmpty ? <String, dynamic>{} : tools.first,
          );
      if (selected['name'] is String) toolName = selected['name'] as String;
      if (selected['inputSchema'] is Map) {
        schema = Map<String, dynamic>.from(selected['inputSchema'] as Map);
      }
    } catch (_) {}
    final called = await send(
      _rpc(
          'tools/call',
          {
            'name': toolName,
            'arguments': _buildArgs(schema, query, limit),
          },
          3),
      responseId: 3,
    );
    _throwRpcError(called);
    return called?['result'];
  } finally {
    await subscription.cancel();
  }
}

Map<String, dynamic> _rpc(
  String method, [
  Object? params,
  int? id,
]) =>
    {
      'jsonrpc': '2.0',
      if (id != null) 'id': id,
      'method': method,
      if (params != null) 'params': params,
    };

Map<String, dynamic>? _parseRpcBody(String raw) {
  final text = raw.trim();
  if (text.isEmpty) return null;
  try {
    final decoded = jsonDecode(text);
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
  } catch (_) {}
  Map<String, dynamic>? last;
  for (final line in text.split(RegExp(r'\r?\n'))) {
    if (!line.startsWith('data:')) continue;
    try {
      final decoded = jsonDecode(line.substring(5).trim());
      if (decoded is Map) last = Map<String, dynamic>.from(decoded);
    } catch (_) {}
  }
  return last;
}

void _throwRpcError(Map<String, dynamic>? response) {
  final error = response?['error'];
  if (error is Map) {
    throw StateError(error['message']?.toString() ?? 'MCP call failed');
  }
}

Map<String, dynamic> _buildArgs(
  Map<String, dynamic>? schema,
  String query,
  int limit,
) {
  final properties = schema?['properties'];
  if (properties is! Map) return {'query': query, 'limit': limit};
  final args = <String, dynamic>{};
  var hasString = false;
  for (final entry in properties.entries) {
    final definition = entry.value;
    if (definition is! Map) continue;
    final type = definition['type'];
    final isString =
        type == 'string' || type is List && type.contains('string');
    final isNumber = type == 'number' || type == 'integer';
    if (!hasString && isString) {
      args[entry.key.toString()] = query;
      hasString = true;
    } else if (isNumber &&
        RegExp(r'limit|top|count|num|size|^k$', caseSensitive: false)
            .hasMatch(entry.key.toString())) {
      args[entry.key.toString()] = limit;
    }
  }
  if (!hasString) args['query'] = query;
  return args;
}
