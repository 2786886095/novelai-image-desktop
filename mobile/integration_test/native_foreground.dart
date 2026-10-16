// Strict native foreground barrier; never mocks lifecycle or skips checks.
// ignore_for_file: avoid_print
import 'dart:async';
import 'package:flutter/material.dart';

Future<void> nativeForegroundBarrier({bool renderBootstrap = true}) async {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  if (renderBootstrap) {
    runApp(const MaterialApp(
        home: Scaffold(
            body:
                Center(child: Text('Native acceptance foreground barrier')))));
  }
  binding.scheduleFrame();
  await binding.endOfFrame.timeout(const Duration(seconds: 20),
      onTimeout: () => throw StateError('Native first frame did not render'));
  final deadline = DateTime.now().add(const Duration(seconds: 20));
  while (binding.lifecycleState != AppLifecycleState.resumed) {
    if (DateTime.now().isAfter(deadline)) {
      throw StateError(
          'Native app is not foreground/resumed: ${binding.lifecycleState}');
    }
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  binding.scheduleFrame();
  await binding.endOfFrame.timeout(const Duration(seconds: 20),
      onTimeout: () => throw StateError('Native resumed frame did not render'));
  if (binding.lifecycleState != AppLifecycleState.resumed ||
      binding.rootElement == null) {
    throw StateError('Native foreground lost before scenarios');
  }
  print(
      'FEATURE_NATIVE_FOREGROUND:resumed; actual first/resumed frames rendered');
}
