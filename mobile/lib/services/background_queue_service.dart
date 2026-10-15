import 'dart:io';
import 'dart:async';

import 'package:flutter_foreground_task/flutter_foreground_task.dart';

@pragma('vm:entry-point')
void queueServiceCallback() {
  FlutterForegroundTask.setTaskHandler(_QueueKeepAliveHandler());
}

class _QueueKeepAliveHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {}

  @override
  void onRepeatEvent(DateTime timestamp) {}

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {}

  @override
  void onReceiveData(Object data) {
    if (data is Map && data['action'] == 'queue-ready-ping' &&
        data['nonce'] is String) {
      FlutterForegroundTask.sendDataToMain({
        'action': 'queue-ready', 'nonce': data['nonce'],
      });
    }
  }

  @override
  void onNotificationButtonPressed(String id) {
    if (id == 'cancel') {
      FlutterForegroundTask.sendDataToMain({'action': 'cancel'});
    }
  }
}

abstract final class BackgroundQueueService {
  static final Set<String> _owners = {};
  static final Set<void Function()> _cancelHandlers = {};
  static bool _initialized = false;
  static bool _warnedNoBackgroundSupport = false;
  static Future<void> _lifecycleTail = Future.value();
  static Completer<void>? _ready;
  static String? _readyNonce;
  static int _readySequence = 0;

  // Returning startService only proves the Android Service is running. Its
  // Dart callback can start later; destroying it first loses the background
  // channel and raises MissingPluginException from setTaskHandler. Serialize
  // lifecycle changes and require a real, nonce-bound TaskHandler response.
  static Future<void> _serialize(Future<void> Function() action) {
    final next = _lifecycleTail.then((_) => action());
    // Keep the queue usable after a failure; callers still receive `next` and
    // its original error, rather than a swallowed successful result.
    _lifecycleTail = next.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return next;
  }

  static Future<void> _waitForTaskReady() async {
    final ready = Completer<void>();
    final nonce = '${DateTime.now().microsecondsSinceEpoch}-${++_readySequence}';
    _ready = ready;
    _readyNonce = nonce;
    void ping() => FlutterForegroundTask.sendDataToTask({
      'action': 'queue-ready-ping', 'nonce': nonce,
    });
    ping();
    final retry = Timer.periodic(const Duration(milliseconds: 100), (_) => ping());
    try {
      await ready.future.timeout(const Duration(seconds: 10), onTimeout: () {
        throw StateError('Background queue task did not become ready.');
      });
    } finally {
      retry.cancel();
      if (identical(_ready, ready)) { _ready = null; _readyNonce = null; }
    }
  }

  // flutter_foreground_task is Android-only (there is no iOS equivalent
  // service API it wraps) — every method below no-ops on other platforms.
  // A long paid queue backgrounded on iOS is not kept alive the way it is
  // on Android; iOS may suspend the app after its normal grace period. This
  // exists so callers can surface that honestly instead of the UI silently
  // implying cross-platform parity it can't actually deliver (P1-17).
  static bool get supportsBackgroundExecution => Platform.isAndroid;

  /// Returns true exactly once per app run, the first time a caller checks
  /// this on a platform without real background support — callers use that
  /// to show a one-time "keep the app open" notice instead of repeating it
  /// on every single queue start.
  static bool shouldWarnNoBackgroundSupport() {
    if (supportsBackgroundExecution || _warnedNoBackgroundSupport) return false;
    _warnedNoBackgroundSupport = true;
    return true;
  }

  static void initialize() {
    if (_initialized || !Platform.isAndroid) return;
    _initialized = true;
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'langbai_generation_queue',
        channelName: 'Langbai generation queue',
        channelDescription:
            'Shows progress while image or comic queues run in the background.',
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: false,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.nothing(),
        autoRunOnBoot: false,
        autoRunOnMyPackageReplaced: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
    FlutterForegroundTask.addTaskDataCallback(_onTaskData);
  }

  static void addCancelHandler(void Function() handler) =>
      _cancelHandlers.add(handler);

  static void removeCancelHandler(void Function() handler) =>
      _cancelHandlers.remove(handler);

  static void _onTaskData(Object data) {
    if (data is Map && data['action'] == 'queue-ready' &&
        data['nonce'] == _readyNonce && _ready != null && !_ready!.isCompleted) {
      _ready!.complete();
      return;
    }
    if (data is Map && data['action'] == 'cancel') {
      for (final handler in List<void Function()>.from(_cancelHandlers)) {
        handler();
      }
    }
  }

  static Future<void> start(
    String owner, {
    required String title,
    required String text,
  }) {
    if (!Platform.isAndroid) return Future.value();
    initialize();
    _owners.add(owner);
    return _serialize(() async {
    if (!_owners.contains(owner)) return;
    final permission =
        await FlutterForegroundTask.checkNotificationPermission();
    if (permission != NotificationPermission.granted) {
      await FlutterForegroundTask.requestNotificationPermission();
    }
    if (await FlutterForegroundTask.isRunningService) {
      final result = await FlutterForegroundTask.updateService(
        notificationTitle: title,
        notificationText: text,
        notificationButtons: const [
          NotificationButton(id: 'cancel', text: 'Cancel'),
        ],
      );
      if (result is ServiceRequestFailure) throw result.error;
    } else {
      final result = await FlutterForegroundTask.startService(
        serviceId: 9099,
        serviceTypes: const [ForegroundServiceTypes.dataSync],
        notificationTitle: title,
        notificationText: text,
        notificationButtons: const [
          NotificationButton(id: 'cancel', text: 'Cancel'),
        ],
        callback: queueServiceCallback,
      );
      if (result is ServiceRequestFailure) throw result.error;
    }
    await _waitForTaskReady();
    });
  }

  static Future<void> update(
      {required String title, required String text}) {
    if (!Platform.isAndroid) return Future.value();
    return _serialize(() async {
    if (_owners.isEmpty || !await FlutterForegroundTask.isRunningService) return;
    await FlutterForegroundTask.updateService(
      notificationTitle: title,
      notificationText: text,
      notificationButtons: const [
        NotificationButton(id: 'cancel', text: 'Cancel'),
      ],
    );
    });
  }

  static Future<void> stop(String owner) {
    if (!Platform.isAndroid) return Future.value();
    _owners.remove(owner);
    return _serialize(() async {
    if (_owners.isEmpty && await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.stopService();
    }
    });
  }
}
