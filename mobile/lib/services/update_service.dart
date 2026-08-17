import 'dart:convert';

import 'package:http/http.dart' as http;

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
  final client = createProxyHttpClient(settings, scope: ProxyScope.update);
  try {
    return await checkAppUpdateWithClient(client);
  } finally {
    client.close();
  }
}

const _releaseUrl =
    'https://github.com/2786886095/novelai-image-desktop/releases/latest';
const _latestYmlUrl =
    'https://github.com/2786886095/novelai-image-desktop/releases/latest/download/latest.yml';
const _releaseApiUrl =
    'https://api.github.com/repos/2786886095/novelai-image-desktop/releases/latest';

String? parseLatestYmlVersion(String source) {
  final match = RegExp(
    r'''^\s*version\s*:\s*["']?v?([^\s"']+)''',
    caseSensitive: false,
    multiLine: true,
  ).firstMatch(source);
  return match?.group(1)?.trim();
}

Future<http.Response> _getWithRetry(
  http.Client client,
  Uri uri, {
  Map<String, String>? headers,
}) async {
  Object? lastError;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      final response = await client
          .get(uri, headers: headers)
          .timeout(const Duration(seconds: 8));
      if (response.statusCode < 500 || attempt == 1) return response;
      lastError = Exception('HTTP ${response.statusCode}');
    } catch (error) {
      lastError = error;
    }
    await Future<void>.delayed(const Duration(milliseconds: 350));
  }
  throw lastError ?? Exception('update check failed');
}

/// Uses the updater manifest first because some networks block api.github.com
/// while still allowing release downloads. The GitHub API remains a fallback.
Future<UpdateInfo> checkAppUpdateWithClient(http.Client client) async {
  const current = appVersion;
  Object? primaryError;
  try {
    final response = await _getWithRetry(client, Uri.parse(_latestYmlUrl));
    if (response.statusCode >= 200 && response.statusCode < 300) {
      final latest = parseLatestYmlVersion(response.body);
      if (latest != null && latest.isNotEmpty) {
        return UpdateInfo(
          hasUpdate: compareVersions(latest, current) > 0,
          currentVersion: current,
          latestVersion: latest,
          releaseUrl: _releaseUrl,
        );
      }
    }
  } catch (error) {
    primaryError = error;
  }

  try {
    final response = await _getWithRetry(
      client,
      Uri.parse(_releaseApiUrl),
      headers: const {'Accept': 'application/vnd.github+json'},
    );
    if (response.statusCode == 404) {
      return const UpdateInfo(hasUpdate: false, currentVersion: current);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('HTTP ${response.statusCode}');
    }
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final latest = (json['tag_name']?.toString() ?? '')
        .replaceFirst(RegExp(r'^v'), '')
        .trim();
    if (latest.isEmpty) {
      return const UpdateInfo(hasUpdate: false, currentVersion: current);
    }
    return UpdateInfo(
      hasUpdate: compareVersions(latest, current) > 0,
      currentVersion: current,
      latestVersion: latest,
      releaseUrl: json['html_url']?.toString() ?? _releaseUrl,
    );
  } catch (_) {
    return UpdateInfo(
      hasUpdate: false,
      currentVersion: current,
      // Keep the diagnostic intentionally short. Raw socket errors are neither
      // actionable to users nor safe for a compact settings card.
      error: primaryError == null ? 'unavailable' : 'network',
    );
  }
}
