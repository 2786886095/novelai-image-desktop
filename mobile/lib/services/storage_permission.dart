import 'dart:io';

import 'package:flutter/services.dart';

// Thin wrapper over the native `langbai.novelai/storage` channel (Android).
// Writing generated images into a user-chosen folder needs "All files access"
// on Android 11+ (API 30); on older versions legacy storage already grants it,
// and on non-Android platforms the concept does not apply.
class StoragePermission {
  static const MethodChannel _channel = MethodChannel('langbai.novelai/storage');

  // True when the app can freely write to user-chosen external folders.
  static Future<bool> hasAllFilesAccess() async {
    if (!Platform.isAndroid) return true;
    try {
      return await _channel.invokeMethod<bool>('isExternalStorageManager') ??
          false;
    } catch (_) {
      return false;
    }
  }

  // Opens the system "All files access" page for this app so the user can grant
  // it. No-op when already granted or not on Android.
  static Future<void> requestAllFilesAccess() async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod<void>('requestExternalStorageManager');
    } catch (_) {}
  }
}
