import 'dart:async';
import 'package:flutter/foundation.dart';
import 'translation.dart';

class TranslationReply {
  final bool ok;
  final String text, error;
  final String? sourceLanguage;
  const TranslationReply(
      {required this.ok, this.text = '', this.error = '', this.sourceLanguage});
}

typedef TranslationRunner = Future<TranslationReply> Function(
    String source, String target, String from);

/// One local draft and one in-flight request. Only the newest intent is accepted.
class TranslationSession extends ChangeNotifier {
  String source,
      target,
      sourceLanguage,
      result = '',
      detectedSource = '',
      error = '';
  bool live, busy = false, composing = false, valid = false;
  final TranslationRunner runner;
  final Duration delay;
  Timer? _timer;
  int _revision = 0;
  bool _queued = false, _disposed = false;
  TranslationSession(this.source, this.target, this.runner,
      {this.live = false,
      String sourceLanguage = 'auto',
      this.delay = const Duration(milliseconds: 600)})
      : sourceLanguage = normalizeTranslationSource(sourceLanguage);
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _cancel() {
    _timer?.cancel();
    _timer = null;
    _queued = false;
  }

  void _invalidate() {
    _revision++;
    _cancel();
    valid = false;
    error = '';
    detectedSource = '';
  }

  void _schedule() {
    if (!live || composing || source.trim().isEmpty || _disposed) return;
    _timer = Timer(delay, () {
      _timer = null;
      _queued = true;
      unawaited(_drain());
    });
  }

  void start() => _schedule();
  void editSource(String value) {
    _invalidate();
    source = value;
    if (value.trim().isEmpty) result = '';
    _notify();
    _schedule();
  }

  void editResult(String value) {
    _revision++;
    _cancel();
    result = value;
    valid = value.trim().isNotEmpty;
    error = '';
    _notify();
  }

  void setLanguages(String from, String to) {
    from = normalizeTranslationSource(from);
    if (from == sourceLanguage && to == target) return;
    _invalidate();
    sourceLanguage = from;
    target = to;
    _notify();
    _schedule();
  }

  void setLive(bool value) {
    if (value == live) return;
    _cancel();
    live = value;
    _notify();
    if (value) _schedule();
  }

  Future<void> persistLive(
      bool value, Future<void> Function(bool) persist) async {
    final previous = live;
    setLive(value);
    try {
      await persist(value);
    } catch (_) {
      if (!_disposed) setLive(previous);
      rethrow;
    }
  }

  void setComposing(bool value, {bool scheduleOnEnd = true}) {
    if (value == composing) return;
    _cancel();
    if (value) _revision++;
    composing = value;
    _notify();
    if (!value && scheduleOnEnd) _schedule();
  }

  String get swapSource =>
      sourceLanguage == 'auto' ? detectedSource : sourceLanguage;
  bool get canSwap => swapSource.isNotEmpty && !busy && !composing;
  bool swap() {
    if (!canSwap) return false;
    final oldSource = source,
        oldResult = result,
        oldValid = valid,
        oldTarget = target,
        from = swapSource;
    _invalidate();
    sourceLanguage = oldTarget;
    target = from;
    source = oldValid && oldResult.trim().isNotEmpty ? oldResult : oldSource;
    result = oldValid ? oldSource : '';
    valid = oldValid && oldSource.trim().isNotEmpty;
    _notify();
    if (!valid) _schedule();
    return true;
  }

  void translate() {
    if (_disposed || composing || source.trim().isEmpty) return;
    _cancel();
    _queued = true;
    unawaited(_drain());
  }

  Future<void> _drain() async {
    if (_disposed || busy || !_queued || composing) return;
    _queued = false;
    final input = source, to = target, from = sourceLanguage, id = _revision;
    busy = true;
    error = '';
    _notify();
    try {
      final reply = await runner(input, to, from);
      if (_disposed || id != _revision) return;
      if (!reply.ok || reply.text.trim().isEmpty) {
        valid = false;
        error = reply.error.isEmpty ? 'TRANSLATION_FAILED' : reply.error;
        _notify();
        return;
      }
      result = reply.text.trim();
      valid = true;
      final detected = normalizeTranslationSource(reply.sourceLanguage);
      detectedSource = detected == 'auto' ? '' : detected;
      _notify();
    } catch (e) {
      if (!_disposed && id == _revision) {
        valid = false;
        error = '$e';
        _notify();
      }
    } finally {
      if (!_disposed) {
        busy = false;
        _notify();
        if (_queued) unawaited(_drain());
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _revision++;
    _cancel();
    super.dispose();
  }
}
