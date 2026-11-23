import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

final _goKey = Object();
String _fresh() {
  final rng = Random.secure();
  return List.generate(
      16, (_) => rng.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

T withGoTask<T>(T Function() run) =>
    runZoned(run, zoneValues: {_goKey: _fresh()});
T withGoConversation<T>(String id, T Function() run) =>
    runZoned(run, zoneValues: {
      _goKey:
          sha256.convert(utf8.encode('studio-go-conversation:$id')).toString()
    });

Map<String, String> goHeaders(Uri u) {
  if (u.scheme != 'https' ||
      u.host != 'opencode.ai' ||
      u.port != 443 ||
      u.userInfo.isNotEmpty ||
      u.hasQuery ||
      u.hasFragment ||
      !const {
        '/inference/go/v1/chat/completions',
        '/inference/go/v1/responses',
        '/inference/go/v1/messages'
      }.contains(u.path)) return const {};
  return {
    'x-opencode-session': Zone.current[_goKey] as String? ?? _fresh(),
    'User-Agent': 'Langbai-NovelAI-Studio/mobile'
  };
}

Future<http.Response> postGoScoped(http.Client client, Uri uri,
    {required Map<String, String> headers,
    required String body,
    required Map<String, String> go}) async {
  if (go.isEmpty) return client.post(uri, headers: headers, body: body);
  final request = http.Request('POST', uri)
    ..followRedirects = false
    ..headers.addAll({...headers, ...go})
    ..body = body;
  return http.Response.fromStream(await client.send(request));
}
