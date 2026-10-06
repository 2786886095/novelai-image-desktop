import 'package:flutter/services.dart';

/// Native bytes are copied to application cache only on a paste/drop gesture.
class ComposerTransfers {
  static final Object _legacyOwner = Object();
  static final Map<Object, Future<void> Function(List<String>)> _listeners = {};
  static Object? _activeOwner;
  static void listenFor(
      Object owner, Future<void> Function(List<String>)? onDrop) {
    if (onDrop == null) {
      _listeners.remove(owner);
    } else {
      _listeners[owner] = onDrop;
    }
    channel.setMethodCallHandler((call) async {
      if (call.method == 'drop' && call.arguments is List) {
        await _listeners[_activeOwner]?.call(List<String>.from(call.arguments));
      }
    });
  }

  static const channel = MethodChannel('langbai.novelai/composer_files');
  static Future<List<String>> paste() async {
    try {
      return (await channel.invokeListMethod<String>('paste')) ?? [];
    } on MissingPluginException {
      return [];
    }
  }

  static Future<void> region(Rect? rect) => regionFor(_legacyOwner, rect);

  static Future<void> regionFor(Object owner, Rect? rect) async {
    if (rect == null && _activeOwner != owner) return;
    _activeOwner = rect == null ? null : owner;
    try {
      await channel.invokeMethod(
          'region',
          rect == null
              ? null
              : {
                  'x': rect.left,
                  'y': rect.top,
                  'width': rect.width,
                  'height': rect.height
                });
    } on MissingPluginException {
      return; // This platform has no native composer bridge.
    }
  }

  static void listen(Future<void> Function(List<String>)? onDrop) =>
      listenFor(_legacyOwner, onDrop);
}
