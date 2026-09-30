import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:image/image.dart' as image;

class CompatibleImageConfig {
  final String baseUrl, model, apiKey, responseFormat;
  final bool allowInsecureHttp;
  const CompatibleImageConfig(
      {required this.baseUrl,
      required this.model,
      required this.apiKey,
      this.responseFormat = 'auto',
      this.allowInsecureHttp = false});
}

class CompatibleImageCancellation {
  final _done = Completer<void>();
  bool get cancelled => _done.isCompleted;
  Future<void> get whenCancelled => _done.future;
  void cancel() {
    if (!_done.isCompleted) _done.complete();
  }
}

class CompatibleImageFailure {
  final String phase;
  final int? status;
  const CompatibleImageFailure(this.phase, [this.status]);
  String get message {
    final reason = switch (status) {
      401 => '认证失败',
      403 => '访问被拒绝',
      404 => '接口或模型不存在',
      429 => '限流或配额不足',
      final int s when s >= 500 => '上游服务异常',
      final int s when s >= 300 && s < 400 => '接口重定向已停止',
      null => switch (phase) {
          'configuration' => '配置无效，请检查接口、模型、尺寸和密钥',
          'download' => '生成结果的图片下载未完成',
          'decode' => '图片数据无效、超出处理大小或返回张数不符',
          _ => '连接中断、超时或生成响应无效',
        },
      _ => '上游拒绝请求',
    };
    return '图片接口${status == null ? '' : ' HTTP $status'}：$reason。未自动重新提交生成请求，请先核对服务端记录。';
  }

  @override
  String toString() => message;
}

class CompatibleImageBatch {
  final List<Uint8List> images;
  final bool complete, submitted, cancelled, timedOut;
  final CompatibleImageFailure? error;
  CompatibleImageBatch(
      {required List<Uint8List> images,
      required this.complete,
      required this.submitted,
      this.cancelled = false,
      this.timedOut = false,
      this.error})
      : images = List.unmodifiable(images);
}

bool _local(Uri url) =>
    ['localhost', '127.0.0.1', '::1', '[::1]'].contains(url.host);

Uri compatibleImageEndpoint(String value, {bool allowInsecureHttp = false}) {
  final url = Uri.tryParse(value.trim());
  if (url == null ||
      url.host.isEmpty ||
      !['https', 'http'].contains(url.scheme) ||
      url.userInfo.isNotEmpty ||
      url.hasQuery ||
      url.hasFragment ||
      url.scheme == 'http' && !_local(url) && !allowInsecureHttp) {
    throw const FormatException('图片接口须为有效 HTTPS 或本机地址，不包含凭据或查询参数');
  }
  var path = url.path.replaceFirst(RegExp(r'/+$'), '');
  if (!path.endsWith('/images/generations')) path += '/images/generations';
  return url.replace(path: path);
}

Map<String, Object> compatibleImageBody(CompatibleImageConfig config,
    {required String prompt,
    required String size,
    required int n,
    Map<String, Object?> extensions = const {}}) {
  if (config.model.trim().isEmpty ||
      config.model.length > 256 ||
      prompt.trim().isEmpty ||
      !(size == 'auto' ||
          RegExp(r'^[1-9]\d{0,4}x[1-9]\d{0,4}$').hasMatch(size)) ||
      n < 1 ||
      n > 9007199254740991) {
    throw const FormatException('模型、提示词、尺寸或张数无效');
  }
  final body = <String, Object>{
    'model': config.model.trim(),
    'prompt': prompt,
    'size': size,
    'n': n
  };
  if (config.responseFormat != 'auto') {
    if (!['b64_json', 'url'].contains(config.responseFormat)) {
      throw const FormatException('返回格式无效');
    }
    body['response_format'] = config.responseFormat;
  }
  for (final entry in extensions.entries) {
    final key = entry.key, value = entry.value;
    if (['negative_prompt', 'sampler'].contains(key)) {
      if (value is! String) throw const FormatException('扩展参数类型无效');
    } else if (['steps', 'scale', 'seed'].contains(key)) {
      if (value is! num ||
          !value.isFinite ||
          key != 'scale' &&
              (value != value.truncateToDouble() ||
                  value.abs() > 9007199254740991)) {
        throw const FormatException('扩展参数数值无效');
      }
    } else {
      throw const FormatException('未支持的网关扩展字段');
    }
    body[key] = value!;
  }
  return body;
}

/// Creates a private, non-retrying client. The caller owns the result, including
/// valid images preceding a later failure. Never rerun the billed POST to repair it.
Future<CompatibleImageBatch> generateCompatibleImages(
    CompatibleImageConfig config,
    {required String prompt,
    required String size,
    required int n,
    Map<String, Object?> extensions = const {},
    CompatibleImageCancellation? cancellation,
    void Function()? beforeSubmit,
    Future<http.Client> Function(Uri)? clientForUri,
    Duration timeout = const Duration(minutes: 3),
    int maxBytes = 64 * 1024 * 1024}) async {
  final images = <Uint8List>[];
  final clients = <http.Client>{}, abort = Completer<void>();
  var submitted = false, timedOut = false, phase = 'configuration';
  int? status;
  void stop() {
    if (!abort.isCompleted) abort.complete();
  }

  final timer = Timer(timeout, () {
    timedOut = true;
    stop();
    for (final client in clients) {
      client.close();
    }
  });
  final stopFuture = cancellation == null
      ? abort.future
      : Future.any([abort.future, cancellation.whenCancelled]);
  void check() {
    if (timedOut || cancellation?.cancelled == true) {
      throw const FormatException('stopped');
    }
  }

  Future<({int status, Uint8List bytes, Map<String, String> headers})> send(
      String method, Uri uri,
      {String? body, bool credential = false}) async {
    check();
    final req = http.AbortableRequest(method, uri, abortTrigger: stopFuture)
      ..followRedirects = false;
    if (credential) {
      req.headers.addAll({
        'Authorization': 'Bearer ${config.apiKey.trim()}',
        'Content-Type': 'application/json'
      });
    }
    if (body != null) req.body = body;
    final pendingClient =
        (clientForUri?.call(uri) ?? Future.value(http.Client())).then((client) {
      if (timedOut || cancellation?.cancelled == true) {
        client.close();
        throw const FormatException('stopped');
      }
      clients.add(client);
      return client;
    });
    final client = await Future.any([
      pendingClient,
      stopFuture
          .then<http.Client>((_) => throw const FormatException('stopped'))
    ]);
    check();
    if (credential) {
      beforeSubmit?.call();
      check();
      submitted = true;
    }
    final response = await client.send(req);
    final bytes = BytesBuilder(copy: false);
    await for (final chunk in response.stream) {
      check();
      if (bytes.length + chunk.length > maxBytes) {
        throw const FormatException('response byte limit');
      }
      bytes.add(chunk);
    }
    return (
      status: response.statusCode,
      bytes: bytes.takeBytes(),
      headers: response.headers
    );
  }

  try {
    final endpoint = compatibleImageEndpoint(config.baseUrl,
        allowInsecureHttp: config.allowInsecureHttp);
    final body = compatibleImageBody(config,
        prompt: prompt, size: size, n: n, extensions: extensions);
    if (config.apiKey.trim().isEmpty ||
        RegExp(r'[\r\n]').hasMatch(config.apiKey)) {
      throw const FormatException('invalid credential');
    }
    final json = jsonEncode(body);
    if (utf8.encode(json).length > maxBytes) {
      throw const FormatException('request byte limit');
    }
    check();
    phase = 'generate';
    final response = await send('POST', endpoint, body: json, credential: true);
    status = response.status;
    if (status < 200 || status >= 300) {
      throw const FormatException('HTTP status');
    }
    status = null;
    final parsed = jsonDecode(utf8.decode(response.bytes));
    if (parsed is! Map ||
        parsed['data'] is! List ||
        (parsed['data'] as List).isEmpty) {
      throw const FormatException('missing data');
    }
    var consumed = 0, decodedBytes = 0;
    for (final entry in parsed['data'] as List) {
      check();
      phase = 'decode';
      Uint8List bytes;
      if (entry is Map && entry['b64_json'] is String) {
        final encoded = entry['b64_json'] as String;
        if (encoded.isEmpty ||
            encoded.length > maxBytes * 4 / 3 + 4 ||
            encoded.length % 4 != 0 ||
            !RegExp(r'^[A-Za-z0-9+/]*={0,2}$').hasMatch(encoded)) {
          throw const FormatException('invalid base64');
        }
        bytes = base64Decode(encoded);
        if (base64Encode(bytes) != encoded) {
          throw const FormatException('noncanonical base64');
        }
      } else if (entry is Map && entry['url'] is String) {
        phase = 'download';
        var url = Uri.parse(entry['url'] as String);
        var redirects = 0;
        while (true) {
          if (url.host.isEmpty ||
              !['http', 'https'].contains(url.scheme) ||
              url.userInfo.isNotEmpty ||
              url.hasFragment ||
              url.scheme == 'http' &&
                  !config.allowInsecureHttp &&
                  !(_local(url) && endpoint.scheme == 'http')) {
            throw const FormatException('invalid image URL');
          }
          final download = await send('GET', url);
          status = download.status;
          if ([301, 302, 303, 307, 308].contains(status) &&
              redirects < 3 &&
              download.headers.containsKey('location')) {
            final next = url.resolve(download.headers['location']!);
            if (url.scheme == 'https' && next.scheme != 'https') {
              throw const FormatException('downgrade');
            }
            redirects++;
            url = next;
            continue;
          }
          if (status < 200 || status >= 300) {
            throw const FormatException('image HTTP status');
          }
          status = null;
          bytes = download.bytes;
          break;
        }
      } else {
        throw const FormatException('missing image');
      }
      phase = 'decode';
      consumed += bytes.length;
      if (bytes.isEmpty || consumed > maxBytes) {
        throw const FormatException('image byte limit');
      }
      final decoder = image.findDecoderForData(bytes);
      final info = decoder?.startDecode(bytes);
      if (decoder == null ||
          info == null ||
          info.width * info.height > 64 * 1024 * 1024) {
        throw const FormatException('image dimensions');
      }
      final decoded = decoder.decodeFrame(0);
      if (decoded == null) throw const FormatException('image decode');
      decoded.exif = image.ExifData();
      decoded.textData = null;
      decoded.iccProfile = null;
      final clean = image.encodePng(decoded);
      decodedBytes += clean.length;
      if (decodedBytes > maxBytes) {
        throw const FormatException('decoded byte limit');
      }
      images.add(clean);
    }
    check();
    if (images.length != n) throw const FormatException('image count mismatch');
    return CompatibleImageBatch(
        images: images, complete: true, submitted: submitted);
  } catch (_) {
    // Raw ClientException text, headers, server bodies and image URLs never reach UI/logs.
    return CompatibleImageBatch(
        images: images,
        complete: false,
        submitted: submitted,
        cancelled: cancellation?.cancelled == true,
        timedOut: timedOut,
        error: CompatibleImageFailure(phase, status));
  } finally {
    timer.cancel();
    stop();
    for (final client in clients) {
      client.close();
    }
  }
}
