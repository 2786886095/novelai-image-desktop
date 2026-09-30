import 'dart:async';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

/// Bounded one-shot small-response transport (login / account GET only).
/// The deadline includes async proxy/client opening, headers and body. A late
/// client is closed without sending; response subscriptions are cancelled on
/// timeout/overflow. No redirect, retry, or response-body error disclosure.
Future<http.Response> novelAiBoundedRequest({
  required FutureOr<http.Client> Function() openClient,
  required http.BaseRequest request,
  Duration timeout = const Duration(seconds: 30),
  int maxResponseBytes = 64 * 1024,
  Set<int> bodyStatuses = const {200, 201},
  void Function(http.Client)? onOpened,
  void Function(http.Client)? onClosed,
}) async {
  if (timeout <= Duration.zero || maxResponseBytes <= 0) {
    throw ArgumentError('Positive request bounds required');
  }
  request.followRedirects = false;
  request.maxRedirects = 0;
  http.Client? acquired;
  StreamSubscription<List<int>>? subscription;
  Completer<http.Response>? responseDone;
  var finished = false;
  void cancelSubscription() {
    final sub = subscription;
    subscription = null;
    if (sub != null) {
      // A hostile stream's cancel Future must not extend the deadline.
      unawaited(sub.cancel().catchError((Object _) {}));
    }
  }

  try {
    return await (() async {
      final client = await openClient();
      if (finished) {
        client.close();
        throw TimeoutException('NovelAI request expired before client opened');
      }
      acquired = client;
      onOpened?.call(client);
      final response = await client.send(request);
      if (finished) {
        unawaited(response.stream
            .listen((_) {}, onError: (Object _) {})
            .cancel()
            .catchError((Object _) {}));
        throw TimeoutException('NovelAI request expired before headers');
      }
      if (!bodyStatuses.contains(response.statusCode)) {
        // Redirect/error bodies are untrusted and not needed for diagnosis.
        subscription = response.stream.listen((_) {}, onError: (Object _) {});
        cancelSubscription();
        return http.Response('', response.statusCode,
            headers: response.headers);
      }
      if ((response.contentLength ?? 0) > maxResponseBytes) {
        subscription = response.stream.listen((_) {}, onError: (Object _) {});
        cancelSubscription();
        throw StateError('NovelAI response exceeds the byte limit');
      }
      final done = Completer<http.Response>();
      responseDone = done;
      final bytes = BytesBuilder(copy: false);
      void fail(Object error, [StackTrace? trace]) {
        if (!done.isCompleted) done.completeError(error, trace);
        cancelSubscription();
      }

      subscription = response.stream.listen((chunk) {
        if (done.isCompleted || finished) return;
        if (chunk.length > maxResponseBytes - bytes.length) {
          fail(StateError('NovelAI response exceeds the byte limit'));
          return;
        }
        bytes.add(chunk);
      }, onError: (Object error, StackTrace trace) {
        fail(StateError('NovelAI response stream failed'), trace);
      }, onDone: () {
        if (!done.isCompleted && !finished) {
          done.complete(http.Response.bytes(
              bytes.takeBytes(), response.statusCode,
              headers: response.headers));
        }
      }, cancelOnError: true);
      return done.future;
    })()
        .timeout(timeout);
  } finally {
    finished = true;
    cancelSubscription();
    final done = responseDone;
    if (done != null && !done.isCompleted) {
      done.completeError(TimeoutException('NovelAI response cancelled'));
    }
    final client = acquired;
    if (client != null) {
      try {
        client.close();
      } finally {
        onClosed?.call(client);
      }
    }
  }
}
