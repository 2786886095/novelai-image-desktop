import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  test('Streamable HTTP MCP performs handshake and reuses its session',
      () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    final methods = <String>[];
    server.listen((request) async {
      final body = jsonDecode(await utf8.decoder.bind(request).join()) as Map;
      final method = body['method'] as String;
      methods.add(method);
      request.response.headers.set('Mcp-Session-Id', 'test-session');
      if (method == 'notifications/initialized') {
        request.response.statusCode = 202;
      } else {
        request.response
          ..statusCode = 200
          ..headers.contentType = ContentType.json
          ..write(jsonEncode(_rpcResponse(body)));
      }
      await request.response.close();
    });
    final settings = AppSettings(
      tagServerUrl: 'http://${server.address.host}:${server.port}/mcp',
      tagServerType: 'http',
      tagServerTool: 'search_tags',
      tagServerEnabled: true,
      proxyMode: 'direct',
    );
    final api = NaiApi();

    final first = await api.searchTags(
      settings,
      '蓝眼',
      5,
      fallbackLocal: false,
    );
    expect(first.single.tag, 'blue_eyes');
    expect(methods, [
      'initialize',
      'notifications/initialized',
      'tools/list',
      'tools/call',
    ]);

    methods.clear();
    final second = await api.searchTags(
      settings,
      '白发',
      5,
      fallbackLocal: false,
    );
    expect(second.single.tag, 'blue_eyes');
    expect(methods, ['tools/call']);
  });

  test('legacy SSE MCP receives endpoint and response events', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    HttpResponse? eventStream;
    final methods = <String>[];
    server.listen((request) async {
      if (request.method == 'GET') {
        eventStream = request.response
          ..statusCode = 200
          ..bufferOutput = false
          ..headers.set(HttpHeaders.contentTypeHeader, 'text/event-stream')
          ..write('event: endpoint\ndata: /messages\n\n');
        await eventStream!.flush();
        return;
      }
      final body = jsonDecode(await utf8.decoder.bind(request).join()) as Map;
      final method = body['method'] as String;
      methods.add(method);
      request.response.statusCode = 202;
      await request.response.close();
      if (body['id'] != null) {
        eventStream?.add(utf8.encode(
            'event: message\ndata: ${jsonEncode(_rpcResponse(body))}\n\n'));
        await eventStream?.flush();
      }
    });
    final tags = await NaiApi().searchTags(
      AppSettings(
        tagServerUrl: 'http://${server.address.host}:${server.port}/sse',
        tagServerType: 'sse',
        tagServerTool: 'search_tags',
        tagServerEnabled: true,
        proxyMode: 'direct',
      ),
      '蓝眼',
      5,
      fallbackLocal: false,
    );

    expect(methods, [
      'initialize',
      'notifications/initialized',
      'tools/list',
      'tools/call',
    ]);
    expect(tags.single.tag, 'blue_eyes');
  });
}

Map<String, dynamic> _rpcResponse(Map request) {
  final method = request['method'];
  final result = switch (method) {
    'initialize' => {
        'protocolVersion': '2024-11-05',
        'capabilities': <String, dynamic>{},
        'serverInfo': {'name': 'test', 'version': '1'},
      },
    'tools/list' => {
        'tools': [
          {
            'name': 'search_tags',
            'inputSchema': {
              'type': 'object',
              'properties': {
                'query': {'type': 'string'},
                'limit': {'type': 'integer'},
              },
            },
          }
        ],
      },
    'tools/call' => {
        'content': [
          {
            'type': 'text',
            'text': jsonEncode({
              'tags': [
                {
                  'tag': 'blue_eyes',
                  'translation': '蓝眼',
                  'count': 123,
                }
              ]
            }),
          }
        ],
      },
    _ => <String, dynamic>{},
  };
  return {'jsonrpc': '2.0', 'id': request['id'], 'result': result};
}
