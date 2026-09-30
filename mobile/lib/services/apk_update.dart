import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import '../models/nai_models.dart';
import 'proxy_http_client.dart';
import 'update_service.dart';

class UpdateCancellation {
  final _done = Completer<void>();
  bool get cancelled => _done.isCompleted;
  void cancel() {
    if (!cancelled) _done.complete();
  }

  void check() {
    if (cancelled) throw StateError('软件更新已取消');
  }

  Future<T> wait<T>(Future<T> work) async {
    // Attach the supplied future even when already cancelled so its eventual
    // error is observed rather than becoming an unhandled asynchronous error.
    final result = await Future.any<T>(
        [work, _done.future.then<T>((_) => throw StateError('软件更新已取消'))]);
    check();
    return result;
  }
}

void validateApkUpdateInfo(UpdateInfo info) {
  final uri = Uri.tryParse(info.releaseUrl ?? ''),
      version = info.latestVersion ?? '',
      digest = info.apkSha256 ?? '',
      size = info.apkSize ?? 0;
  if (!info.hasUpdate ||
      info.error != null ||
      !RegExp(r'^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$').hasMatch(version)) {
    throw const FormatException('No valid update version');
  }
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.host != 'github.com' ||
      uri.hasQuery ||
      uri.hasFragment ||
      ![
        '/2786886095/novelai-image-desktop/releases/download/v$version/app-release.apk',
        '/2786886095/novelai-image-desktop/releases/download/$version/app-release.apk'
      ].contains(uri.path)) {
    throw const FormatException('Untrusted or mismatched update URL');
  }
  if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(digest) ||
      size <= 0 ||
      size > 1024 * 1024 * 1024) {
    throw const FormatException(
        'Update metadata is missing a valid size or SHA-256');
  }
}

Future<bool> verifyApkFile(File file, UpdateInfo info) async {
  if (await FileSystemEntity.type(file.path, followLinks: false) !=
      FileSystemEntityType.file) return false;
  return await file.length() == info.apkSize &&
      (await sha256.bind(file.openRead()).first).toString() == info.apkSha256;
}

typedef UpdateNativeInvoke = Future<dynamic> Function(
    String method, Map<String, dynamic> args);

/// The settings page and Agent share this lease. A second caller never joins an
/// unrelated install or replaces the version the first caller approved.
class ApkUpdateCoordinator {
  final http.Client Function(AppSettings) clientFactory;
  final Future<Directory> Function() directory;
  final UpdateNativeInvoke invoke;
  ApkUpdateSession? _active;
  ApkUpdateCoordinator(
      {http.Client Function(AppSettings)? clientFactory,
      Future<Directory> Function()? directory,
      UpdateNativeInvoke? invoke})
      : clientFactory = clientFactory ??
            ((s) => createProxyHttpClient(s, scope: ProxyScope.update)),
        directory = directory ??
            (() async =>
                Directory('${(await getTemporaryDirectory()).path}/updates')),
        invoke = invoke ??
            ((method, args) => const MethodChannel('langbai.novelai/app_update')
                .invokeMethod<dynamic>(method, args));
  bool get busy => _active != null;
  ApkUpdateSession reserve(AppSettings settings, UpdateInfo info) {
    validateApkUpdateInfo(info);
    if (busy) throw StateError('已有软件更新任务，请读取状态或停止');
    return _active = ApkUpdateSession._(this, settings, info);
  }

  Future<Map<String, dynamic>> nativeStatus() async {
    final raw = await invoke('status', {});
    if (raw is! Map) throw StateError('系统更新状态无效');
    final status = Map<String, dynamic>.from(raw), session = _active;
    if (session != null &&
        status['id'] == session.id &&
        ['installer_closed', 'cancelled', 'failed'].contains(status['state'])) {
      session._release();
    }
    return status;
  }
}

class ApkUpdateSession {
  final ApkUpdateCoordinator owner;
  final AppSettings settings;
  final UpdateInfo info;
  final String id = List.generate(24,
          (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'))
      .join();
  final cancellation = UpdateCancellation();
  http.Client? _client;
  File? _file;
  bool _nativePending = false,
      _installerStarted = false,
      _released = false,
      _nativeInvoked = false;
  ApkUpdateSession._(this.owner, this.settings, this.info);
  void _check() {
    cancellation.check();
    if (_released || owner._active != this) throw StateError('更新交接已失效');
  }

  Future<void> download(void Function(double) progress) async {
    _check();
    final native = await owner.nativeStatus();
    _check();
    if (['checking', 'permission_required', 'installer_started']
        .contains(native['state'])) throw StateError('系统已有待完成的安装');
    final client = owner.clientFactory(settings);
    _client = client;
    try {
      _file = await downloadVerifiedApk(
          client, info, await owner.directory(), progress,
          cancellation: cancellation);
      _check();
    } finally {
      client.close();
      _client = null;
    }
  }

  Future<String> install() async {
    _check();
    final file = _file;
    if (file == null || !await cancellation.wait(verifyApkFile(file, info))) {
      throw StateError('安装包已变化，未打开安装器');
    }
    _check();
    _nativeInvoked = true;
    _nativePending = true;
    final stage = await cancellation.wait(owner.invoke('install',
        {'filePath': file.path, 'id': id, 'version': info.latestVersion}));
    if (stage != 'permission_required' && stage != 'installer_started') {
      throw StateError('安装器未返回有效交接状态：$stage');
    }
    _nativePending = true;
    _installerStarted = stage == 'installer_started';
    return stage as String;
  }

  Future<void> cancel() async {
    if (_installerStarted) throw StateError('系统安装器已打开，请在系统界面取消或等待完成');
    if (_nativeInvoked) {
      final accepted = await owner.invoke('cancel', {'id': id});
      if (accepted != true) {
        _installerStarted = true;
        throw StateError('系统安装器已打开，请在系统界面处理');
      }
    }
    cancellation.cancel();
    _client?.close();
    _nativePending = false;
    _release();
  }

  void _release() {
    if (owner._active == this) owner._active = null;
    _released = true;
    _file = null;
  }

  void release() {
    if (!_nativePending) _release();
  }
}

class ApkUpdate {
  static final coordinator = ApkUpdateCoordinator();
  static Future<String> install(AppSettings settings, UpdateInfo info,
      void Function(double) progress) async {
    await coordinator.nativeStatus();
    final session = coordinator.reserve(settings, info);
    try {
      await session.download(progress);
      return await session.install();
    } finally {
      session.release();
    }
  }
}

Future<File> downloadVerifiedApk(http.Client client, UpdateInfo info,
    Directory directory, void Function(double) progress,
    {UpdateCancellation? cancellation}) async {
  validateApkUpdateInfo(info);
  final cancel = cancellation ?? UpdateCancellation();
  cancel.check();
  final digest = info.apkSha256!, size = info.apkSize!;
  await directory.create(recursive: true);
  cancel.check();
  final ready = File('${directory.path}/studio-$digest.apk'),
      partial = File('${directory.path}/studio-$digest.part');
  if (await cancel.wait(verifyApkFile(ready, info))) {
    progress(1);
    return ready;
  }
  final response = await cancel.wait(client
      .send(http.Request('GET', Uri.parse(info.releaseUrl!)))
      .timeout(const Duration(seconds: 30)));
  if (response.statusCode != 200) {
    throw HttpException('Update download HTTP ${response.statusCode}');
  }
  for (final file in [ready, partial]) {
    final kind = await FileSystemEntity.type(file.path, followLinks: false);
    if (kind != FileSystemEntityType.notFound &&
        kind != FileSystemEntityType.file) {
      throw const FileSystemException('Invalid update file type');
    }
  }
  final output = partial.openWrite(),
      iterator =
          StreamIterator(response.stream.timeout(const Duration(seconds: 180)));
  var received = 0;
  try {
    while (await cancel.wait(iterator.moveNext())) {
      final chunk = iterator.current;
      received += chunk.length;
      if (received > size) {
        throw const FormatException('Update exceeded expected size');
      }
      output.add(chunk);
      progress(received / size);
    }
    await output.close();
    cancel.check();
    if (!await cancel.wait(verifyApkFile(partial, info))) {
      throw const FormatException('Update integrity verification failed');
    }
    if (await ready.exists()) await ready.delete();
    cancel.check();
    return await partial.rename(ready.path);
  } catch (_) {
    try {
      await output.close();
    } catch (_) {/* Preserve the original error. */}
    if (await partial.exists()) await partial.delete();
    rethrow;
  } finally {
    await iterator.cancel();
  }
}
