import 'dart:convert';
import 'dart:io';

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
    return await checkAppUpdateWithClient(
      client,
      preferredSource: settings.updateSource,
    );
  } finally {
    client.close();
  }
}

const _giteeReleaseUrl =
    'https://gitee.com/langbai666/novelai-image-desktop/releases';
const _giteeReleaseApiUrl =
    'https://gitee.com/api/v5/repos/langbai666/novelai-image-desktop/releases/latest';
const _githubReleaseUrl =
    'https://github.com/2786886095/novelai-image-desktop/releases/latest';
const _githubLatestYmlUrl =
    'https://github.com/2786886095/novelai-image-desktop/releases/latest/download/latest.yml';
const _githubReleaseApiUrl =
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

String? _assetUrl(dynamic value, String wantedName) {
  if (value is! List) return null;
  for (final item in value) {
    if (item is! Map) continue;
    final name = (item['name'] ?? item['filename'])?.toString();
    if (name != wantedName) continue;
    final url =
        (item['browser_download_url'] ?? item['download_url'] ?? item['url'])
            ?.toString();
    if (url != null && Uri.tryParse(url)?.scheme == 'https') return url;
  }
  return null;
}

Future<UpdateInfo> _checkGitee(
  http.Client client, {
  required bool isAndroid,
}) async {
  final response = await _getWithRetry(
    client,
    Uri.parse(_giteeReleaseApiUrl),
    headers: const {'Accept': 'application/json', 'Cache-Control': 'no-cache'},
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw Exception('HTTP ${response.statusCode}');
  }
  final json = jsonDecode(response.body) as Map<String, dynamic>;
  final latest = (json['tag_name']?.toString() ?? '')
      .replaceFirst(RegExp(r'^v'), '')
      .trim();
  final releaseId = int.tryParse(json['id']?.toString() ?? '');
  if (latest.isEmpty || releaseId == null) {
    throw Exception('invalid Gitee release');
  }

  final hasUpdate = compareVersions(latest, appVersion) > 0;
  final wantedAsset = isAndroid ? 'app-release.apk' : null;
  var installerUrl =
      wantedAsset == null ? null : _assetUrl(json['assets'], wantedAsset);
  if (hasUpdate && wantedAsset != null && installerUrl == null) {
    final attachments = await _getWithRetry(
      client,
      Uri.parse(
        'https://gitee.com/api/v5/repos/langbai666/novelai-image-desktop/releases/$releaseId/attach_files',
      ),
      headers: const {'Accept': 'application/json'},
    );
    if (attachments.statusCode >= 200 && attachments.statusCode < 300) {
      installerUrl = _assetUrl(jsonDecode(attachments.body), wantedAsset);
    }
  }
  if (hasUpdate && isAndroid && installerUrl == null) {
    throw Exception('Gitee release is missing app-release.apk');
  }
  return UpdateInfo(
    hasUpdate: hasUpdate,
    currentVersion: appVersion,
    latestVersion: latest,
    releaseUrl: installerUrl ?? _giteeReleaseUrl,
  );
}

Future<UpdateInfo> _checkGithubApi(
  http.Client client, {
  required bool isAndroid,
}) async {
  const current = appVersion;
  final response = await _getWithRetry(
    client,
    Uri.parse(_githubReleaseApiUrl),
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
    throw Exception('invalid GitHub release');
  }
  final hasUpdate = compareVersions(latest, current) > 0;
  final installerUrl =
      isAndroid ? _assetUrl(json['assets'], 'app-release.apk') : null;
  if (hasUpdate && isAndroid && installerUrl == null) {
    throw Exception('GitHub release is missing app-release.apk');
  }
  return UpdateInfo(
    hasUpdate: hasUpdate,
    currentVersion: current,
    latestVersion: latest,
    releaseUrl:
        installerUrl ?? json['html_url']?.toString() ?? _githubReleaseUrl,
  );
}

Future<UpdateInfo> _checkGithub(
  http.Client client, {
  required bool isAndroid,
}) async {
  const current = appVersion;
  UpdateInfo manifestInfo;
  try {
    final response =
        await _getWithRetry(client, Uri.parse(_githubLatestYmlUrl));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('HTTP ${response.statusCode}');
    }
    final latest = parseLatestYmlVersion(response.body);
    if (latest == null || latest.isEmpty) {
      throw Exception('invalid GitHub manifest');
    }
    manifestInfo = UpdateInfo(
      hasUpdate: compareVersions(latest, current) > 0,
      currentVersion: current,
      latestVersion: latest,
      releaseUrl: _githubReleaseUrl,
    );
  } catch (_) {
    return _checkGithubApi(client, isAndroid: isAndroid);
  }
  if (isAndroid && manifestInfo.hasUpdate) {
    return _checkGithubApi(client, isAndroid: true);
  }
  return manifestInfo;
}

/// Check the selected source first and automatically retry the other mirror.
Future<UpdateInfo> checkAppUpdateWithClient(
  http.Client client, {
  String preferredSource = 'github',
  bool? isAndroid,
}) async {
  const current = appVersion;
  final android = isAndroid ?? Platform.isAndroid;
  final order = preferredSource == 'gitee'
      ? const ['gitee', 'github']
      : const ['github', 'gitee'];
  UpdateInfo? preferredResult;
  Object? firstError;

  for (final source in order) {
    try {
      final result = source == 'github'
          ? await _checkGithub(client, isAndroid: android)
          : await _checkGitee(client, isAndroid: android);
      preferredResult ??= result;
      if (result.hasUpdate) return result;
    } catch (error) {
      firstError ??= error;
    }
  }

  if (preferredResult != null) return preferredResult;
  return UpdateInfo(
    hasUpdate: false,
    currentVersion: current,
    error: firstError == null ? 'unavailable' : 'network',
  );
}
