import 'dart:convert';

import '../models/nai_models.dart';
import 'proxy_http_client.dart';

class UpdateInfo {
  final bool hasUpdate;
  final String currentVersion;
  final String? latestVersion;
  final String? releaseUrl;
  final String? error;

  const UpdateInfo({
    required this.hasUpdate,
    required this.currentVersion,
    this.latestVersion,
    this.releaseUrl,
    this.error,
  });
}

int compareVersions(String left, String right) {
  List<int> parts(String value) => value
      .replaceFirst(RegExp(r'^v'), '')
      .split(RegExp(r'[.+-]'))
      .map((value) => int.tryParse(value) ?? 0)
      .toList();
  final a = parts(left);
  final b = parts(right);
  final length = a.length > b.length ? a.length : b.length;
  for (var index = 0; index < length; index++) {
    final x = index < a.length ? a[index] : 0;
    final y = index < b.length ? b[index] : 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

Future<UpdateInfo> checkAppUpdate(AppSettings settings) async {
  const current = appVersion;
  const fallbackUrl =
      'https://github.com/2786886095/novelai-image-desktop/releases/latest';
  final client = createProxyHttpClient(settings, scope: ProxyScope.update);
  try {
    final response = await client.get(
      Uri.parse(
          'https://api.github.com/repos/2786886095/novelai-image-desktop/releases/latest'),
      headers: const {'Accept': 'application/vnd.github+json'},
    ).timeout(const Duration(seconds: 10));
    if (response.statusCode == 404) {
      return const UpdateInfo(hasUpdate: false, currentVersion: current);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('HTTP ${response.statusCode}');
    }
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final latest = (json['tag_name']?.toString() ?? '').replaceFirst('v', '');
    if (latest.isEmpty) {
      return const UpdateInfo(hasUpdate: false, currentVersion: current);
    }
    return UpdateInfo(
      hasUpdate: compareVersions(latest, current) > 0,
      currentVersion: current,
      latestVersion: latest,
      releaseUrl: json['html_url']?.toString() ?? fallbackUrl,
    );
  } catch (error) {
    return UpdateInfo(
      hasUpdate: false,
      currentVersion: current,
      error: error.toString().replaceFirst('Exception: ', ''),
    );
  } finally {
    client.close();
  }
}
