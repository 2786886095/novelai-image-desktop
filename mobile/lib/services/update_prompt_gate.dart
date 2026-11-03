import 'package:shared_preferences/shared_preferences.dart';
import 'update_service.dart';

/// One durable presentation per remote version, independent of navigation,
/// repeated checks or process restart. Claim before showing the dialog.
class UpdatePromptGate {
  static const key = 'mobile_update_prompt_seen_v1';
  final Set<String> _seen = {};
  bool _claiming = false;
  Future<bool> claim(UpdateInfo? info) async {
    if (_claiming || info == null || !info.hasUpdate || info.error != null) return false;
    final version = info.latestVersion?.trim().replaceFirst(RegExp(r'^v'), '') ?? '';
    if (!RegExp(r'^\d+\.\d+\.\d+(?:[+.-][A-Za-z0-9.-]+)?$').hasMatch(version) ||
        compareVersions(version, info.currentVersion) <= 0 || _seen.contains(version)) return false;
    _claiming = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getStringList(key) ?? const <String>[];
      if (saved.contains(version)) { _seen.add(version); return false; }
      final next = [...saved, version];
      if (!await prefs.setStringList(key, next)) return false;
      _seen.add(version);
      return true;
    } catch (_) { return false; }
    finally { _claiming = false; }
  }
}
