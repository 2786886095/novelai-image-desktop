// ignore_for_file: avoid_print
// Native queue lifecycle/unsupported-platform guard supplement. No fake platform, provider or profile.
import 'dart:convert';
import 'native_foreground.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:novelai_mobile/services/background_queue_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final errors = <Object>[];
  ui.PlatformDispatcher.instance.onError = (error, stack) {
    errors.add(error);
    print('FEATURE_NATIVE_ASYNC_ERROR:$error\n$stack');
    return true;
  };
  var checked = 0;
  void check(String name, Map<String, Object?> observed) {
    checked++;
    print('FEATURE_ACCEPTANCE_CHECK:${jsonEncode({
      'sourceSha': const String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted'),
      'platform': Platform.operatingSystem,
      'feature': 'batch', 'kind': 'device', 'status': 'passed',
      'journey': name, 'observed': observed, 'mockOnly': false, 'paidCalls': 0,
      'scope': Platform.isAndroid ? 'actual Android foreground queue lifecycle only; not a complete batch feature' : 'actual iOS unsupported-background guards only; no Android service or background-keepalive parity is claimed',
    })}');
  }
  Future<void> start(String id) => BackgroundQueueService.start(id,
      title: 'Native queue acceptance', text: 'Synthetic lifecycle only; no generation');
  void require(bool value, String message) { if (!value) throw StateError(message); }
  try {
    require((Platform.isAndroid || Platform.isIOS) && const bool.fromEnvironment('FEATURE_ISOLATED_DEVICE'), 'Disposable native Android emulator/iOS Simulator required.');
    await nativeForegroundBarrier();
    if (Platform.isIOS) {
      runApp(const MaterialApp(home: Scaffold(body: Center(child: Text('Native iOS queue policy checks')))));
      await WidgetsBinding.instance.endOfFrame;
      require(!BackgroundQueueService.supportsBackgroundExecution, 'iOS falsely advertises Android foreground keepalive');
      check('native iOS unsupported-background capability is explicit', {'supportsBackgroundExecution': false});
      require(BackgroundQueueService.shouldWarnNoBackgroundSupport(), 'First unsupported-background notice missing');
      require(!BackgroundQueueService.shouldWarnNoBackgroundSupport(), 'Unsupported-background notice repeats');
      check('native iOS warns once instead of implying background parity', {'firstWarning': true, 'repeatWarning': false});
      BackgroundQueueService.initialize();
      await start('ios-first');
      check('real production initialize/start returns on iOS without Android service', {'startCompleted': true, 'backgroundKeepaliveClaimed': false});
      await Future.wait([BackgroundQueueService.stop('ios-first'), start('ios-second'), BackgroundQueueService.update(title: 'Fixture', text: 'No generation')]);
      await BackgroundQueueService.stop('ios-second');
      await Future<void>.delayed(const Duration(seconds: 2));
      require(errors.isEmpty, 'Native iOS asynchronous queue policy failure');
      check('native iOS concurrent queue guards complete without Android channel errors', {'completed': true, 'backgroundKeepaliveClaimed': false});
      print('FEATURE_ACCEPTANCE_DONE:${jsonEncode({'sourceSha': const String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted'), 'exitStatus': 0, 'checks': checked, 'platform': Platform.operatingSystem, 'paidCalls': 0})}');
      return;
    }
    FlutterForegroundTask.initCommunicationPort();
    BackgroundQueueService.initialize();
    runApp(const MaterialApp(home: Scaffold(body: Center(child: Text('Native foreground queue lifecycle acceptance')))));
    await WidgetsBinding.instance.endOfFrame;
    for (var i = 0; i < 3; i++) {
      await start('rapid-$i');
      require(await FlutterForegroundTask.isRunningService, 'Native service missing after ready start');
      await BackgroundQueueService.stop('rapid-$i');
      require(!await FlutterForegroundTask.isRunningService, 'Native service retained after last owner stop');
    }
    check('rapid real start/stop (three fresh native TaskHandler callbacks)', {'cycles': 3, 'runningAfterLastStop': false});
    await start('first-owner');
    await start('second-owner');
    await BackgroundQueueService.stop('first-owner');
    require(await FlutterForegroundTask.isRunningService, 'Stopping one owner destroyed another owner service');
    await BackgroundQueueService.stop('second-owner');
    require(!await FlutterForegroundTask.isRunningService, 'Last owner did not stop native service');
    check('native multi-owner retention and last-owner teardown', {'retainedForSecondOwner': true, 'stoppedAfterLastOwner': true});
    final pending = start('immediate-cancel');
    final stop = BackgroundQueueService.stop('immediate-cancel');
    await Future.wait([pending, stop]);
    require(!await FlutterForegroundTask.isRunningService, 'Stop overtook a pending start and left a service');
    check('same-turn cancellation of queued startup', {'noStrandedService': true});
    await start('handoff-before');
    final endOld = BackgroundQueueService.stop('handoff-before');
    final beginNew = start('handoff-after');
    await Future.wait([endOld, beginNew]);
    require(await FlutterForegroundTask.isRunningService, 'Owner handoff lost the live service');
    await BackgroundQueueService.stop('handoff-after');
    require(!await FlutterForegroundTask.isRunningService, 'Owner handoff teardown failed');
    await Future<void>.delayed(const Duration(seconds: 2));
    require(errors.isEmpty, 'Native asynchronous lifecycle failure');
    check('concurrent stop/start owner handoff on actual native service', {'handoffPreservedService': true, 'teardownCompleted': true});
    print('FEATURE_ACCEPTANCE_DONE:${jsonEncode({'sourceSha': const String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted'), 'exitStatus': 0, 'checks': checked, 'platform': Platform.operatingSystem, 'paidCalls': 0})}');
  } catch (error, stack) {
    print('FEATURE_ACCEPTANCE_FAILURE:$error\n$stack');
    print('FEATURE_ACCEPTANCE_DONE:${jsonEncode({'sourceSha': const String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted'), 'exitStatus': 1, 'checks': checked, 'platform': Platform.operatingSystem, 'paidCalls': 0})}');
  }
}
