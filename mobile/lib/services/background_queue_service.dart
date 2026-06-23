import 'dart:io';

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

  static void initialize() {
    if (_initialized || !Platform.isAndroid) return;
    _initialized = true;
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'langbai_generation_queue',
        channelName: 'Langbai 生成队列',
        channelDescription: '图片或漫画队列在后台运行时显示进度。',
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
  }) async {
    if (!Platform.isAndroid) return;
    initialize();
    _owners.add(owner);
    final permission =
        await FlutterForegroundTask.checkNotificationPermission();
    if (permission != NotificationPermission.granted) {
      await FlutterForegroundTask.requestNotificationPermission();
    }
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.updateService(
        notificationTitle: title,
        notificationText: text,
        notificationButtons: const [
          NotificationButton(id: 'cancel', text: '取消'),
        ],
      );
    } else {
      await FlutterForegroundTask.startService(
        serviceId: 9099,
        serviceTypes: const [ForegroundServiceTypes.dataSync],
        notificationTitle: title,
        notificationText: text,
        notificationButtons: const [
          NotificationButton(id: 'cancel', text: '取消'),
        ],
        callback: queueServiceCallback,
      );
    }
  }

  static Future<void> update(
      {required String title, required String text}) async {
    if (!Platform.isAndroid || !await FlutterForegroundTask.isRunningService) {
      return;
    }
    await FlutterForegroundTask.updateService(
      notificationTitle: title,
      notificationText: text,
      notificationButtons: const [
        NotificationButton(id: 'cancel', text: '取消'),
      ],
    );
  }

  static Future<void> stop(String owner) async {
    if (!Platform.isAndroid) return;
    _owners.remove(owner);
    if (_owners.isEmpty && await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.stopService();
    }
  }
}
