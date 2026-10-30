import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Presentation only: no storage, network, account or generation policy changes.
bool isAndroidRedesign(BuildContext context) =>
    !kIsWeb &&
    defaultTargetPlatform == TargetPlatform.android &&
    !const bool.fromEnvironment('LANGBAI_ANDROID_CLASSIC');
