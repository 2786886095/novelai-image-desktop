import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Native bytes are copied to application cache only on a paste/drop gesture.
class ComposerTransfers {
  static const channel = MethodChannel('langbai.novelai/composer_files');
  static Future<List<String>> paste() async {
    try {
      return (await channel.invokeListMethod<String>('paste')) ?? [];
    } on MissingPluginException {
      return [];
    }
  }

  static Future<void> region(Rect? rect) async {
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
    } on MissingPluginException {}
  }

  static void listen(Future<void> Function(List<String>)? onDrop) {
    channel.setMethodCallHandler(onDrop == null
        ? null
        : (call) async {
            if (call.method == 'drop' && call.arguments is List)
              await onDrop(List<String>.from(call.arguments));
          });
  }
}
