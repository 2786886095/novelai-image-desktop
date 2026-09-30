import 'dart:async';
import '../models/nai_models.dart';

/// Host-owned cancellation follows a single async request, never the newest
/// global HTTP client. The final guard also runs before transport retries.
class GenerationScope {
  static final Object _zoneKey = Object();
  static GenerationScope? get current =>
      Zone.current[_zoneKey] as GenerationScope?;
  final void Function()? beforeSubmit;
  final void Function(String, AppSettings)? assertCredentials;
  final Set<void Function()> _cancelHandlers = {};
  bool cancelled = false;
  GenerationScope({this.beforeSubmit, this.assertCredentials});
  void check() {
    if (cancelled) throw StateError('漫画任务已停止，未继续提交图片');
    beforeSubmit?.call();
  }

  void credentials(String token, AppSettings settings) {
    check();
    assertCredentials?.call(token, settings);
  }

  Future<T> run<T>(Future<T> Function() action) =>
      runZoned(action, zoneValues: {_zoneKey: this});
  void Function() attach(void Function() cancel) {
    check();
    _cancelHandlers.add(cancel);
    return () => _cancelHandlers.remove(cancel);
  }

  void cancel() {
    if (cancelled) return;
    cancelled = true;
    for (final cancel in _cancelHandlers.toList()) {
      cancel();
    }
    _cancelHandlers.clear();
  }
}
