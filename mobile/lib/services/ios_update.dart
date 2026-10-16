// Download-only iOS release preparation. A verified unsigned IPA is NOT an
// installed update; this module never signs, launches or calls an installer.
import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;
import '../models/nai_models.dart';
import 'proxy_http_client.dart';
import 'update_service.dart';

const unsignedIpaAssetName = 'novelai-mobile-unsigned.ipa';
void validateIpaUpdateInfo(UpdateInfo info) {
  final version = info.latestVersion ?? '',
      uri = Uri.tryParse(info.ipaUrl ?? '');
  if (!info.hasUpdate ||
      info.error != null ||
      !RegExp(r'^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$').hasMatch(version) ||
      uri == null ||
      uri.scheme != 'https' ||
      uri.host != 'github.com' ||
      (uri.hasPort && uri.port != 443) ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      ![
        '/2786886095/novelai-image-desktop/releases/download/v$version/$unsignedIpaAssetName',
        '/2786886095/novelai-image-desktop/releases/download/$version/$unsignedIpaAssetName'
      ].contains(uri.path)) {
    throw const FormatException('Untrusted or mismatched iOS update asset');
  }
  if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(info.ipaSha256 ?? '') ||
      (info.ipaSize ?? 0) <= 0 ||
      info.ipaSize! > 1024 * 1024 * 1024) {
    throw const FormatException(
        'IPA update requires its own valid size and SHA-256');
  }
}

Future<bool> verifyIpaFile(File file, UpdateInfo info) async {
  if (await FileSystemEntity.type(file.path, followLinks: false) !=
      FileSystemEntityType.file) return false;
  return await file.length() == info.ipaSize &&
      (await sha256.bind(file.openRead()).first).toString() == info.ipaSha256;
}

// Only the final updater-owned directory is forbidden from being an alias.
// System-provided parent aliases (for example iOS /var -> /private/var) are
// canonicalized, not blanket-rejected. These checks do not eliminate OS TOCTOU.
Future<Directory> _prepareIpaDirectory(Directory requested) async {
  final root = Directory(path.normalize(requested.absolute.path));
  final before = await FileSystemEntity.type(root.path, followLinks: false);
  if (before != FileSystemEntityType.notFound &&
      before != FileSystemEntityType.directory) {
    throw FileSystemException('Unsafe IPA cache directory type', root.path);
  }
  if (path.equals(root.path, root.parent.path)) {
    throw FileSystemException(
        'IPA cache cannot be a filesystem root', root.path);
  }
  await root.parent.create(recursive: true);
  final parent = await root.parent.resolveSymbolicLinks();
  final expected = path.normalize(path.join(parent, path.basename(root.path)));
  await root.create(recursive: true);
  if (await FileSystemEntity.type(root.path, followLinks: false) !=
      FileSystemEntityType.directory) {
    throw FileSystemException('IPA cache directory changed type', root.path);
  }
  final canonical = await root.resolveSymbolicLinks();
  if (!path.equals(canonical, expected)) {
    throw FileSystemException('IPA cache left its canonical parent', root.path);
  }
  return Directory(canonical);
}

class _Cancellation {
  final done = Completer<void>();
  bool get cancelled => done.isCompleted;
  void cancel() {
    if (!cancelled) done.complete();
  }

  void check() {
    if (cancelled) throw StateError('IPA download cancelled');
  }

  Future<T> wait<T>(Future<T> future) async {
    final value = await Future.any<T>([
      future,
      done.future.then<T>((_) => throw StateError('IPA download cancelled'))
    ]);
    check();
    return value;
  }
}

typedef IosUpdateNativeInvoke = Future<dynamic> Function(String method);

class IosUpdateCoordinator {
  final http.Client Function(AppSettings) clientFactory;
  final Future<Directory> Function() directory;
  final IosUpdateNativeInvoke invoke;
  IosUpdateSession? _active;
  IosUpdateCoordinator(
      {http.Client Function(AppSettings)? clientFactory,
      Future<Directory> Function()? directory,
      IosUpdateNativeInvoke? invoke})
      : clientFactory = clientFactory ??
            ((s) => createProxyHttpClient(s, scope: ProxyScope.update)),
        directory = directory ??
            (() async => Directory(
                '${(await getApplicationDocumentsDirectory()).path}/ios-updates')),
        invoke = invoke ??
            ((method) => const MethodChannel('langbai.novelai/ios_update')
                .invokeMethod<dynamic>(method));
  bool get busy => _active != null;
  Future<Map<String, dynamic>> nativeStatus() async {
    final raw = await invoke('status');
    if (raw is! Map) throw StateError('Native iOS update status missing');
    final value = Map<String, dynamic>.from(raw);
    if (value['state'] != 'download_only' ||
        value['installSupported'] != false ||
        value['downloadSupported'] != true ||
        value['documentsVisible'] != true ||
        value['openDocumentsInPlace'] != true ||
        value['appDisplayName'] is! String ||
        (value['appDisplayName'] as String).isEmpty ||
        value['currentVersion'] is! String ||
        (value['currentVersion'] as String).isEmpty ||
        value['bundleIdentifier'] is! String ||
        (value['bundleIdentifier'] as String).isEmpty ||
        value['currentBuild'] is! String ||
        (value['currentBuild'] as String).isEmpty) {
      throw StateError('Native iOS download-only capability is invalid');
    }
    return value;
  }

  IosUpdateSession reserve(AppSettings settings, UpdateInfo info) {
    validateIpaUpdateInfo(info);
    if (busy) throw StateError('An IPA download already owns this updater');
    return _active =
        IosUpdateSession._(this, AppSettings.fromJson(settings.toJson()), info);
  }
}

class IosUpdateSession {
  final IosUpdateCoordinator owner;
  final AppSettings settings;
  final UpdateInfo info;
  final _cancellation = _Cancellation();
  bool _released = false;
  bool _running = false;
  Future<File>? _work;
  http.Client? _client;
  IosUpdateSession._(this.owner, this.settings, this.info);
  bool get cancelled => _cancellation.cancelled;
  void _check() {
    _cancellation.check();
    if (_released || owner._active != this) {
      throw StateError('IPA download lease expired');
    }
  }

  Future<File> download(void Function(double) progress,
      {void Function(String)? phase}) {
    _check();
    if (_work != null) throw StateError('This IPA session already started');
    _running = true;
    return _work = _download(progress, phase: phase).whenComplete(() {
      _running = false;
    });
  }

  Future<File> _download(void Function(double) progress,
      {void Function(String)? phase}) async {
    _check();
    final native = await owner.nativeStatus();
    _check();
    if (native['currentVersion'] != info.currentVersion) {
      throw StateError('Installed iOS version changed; check updates again');
    }
    final requestedDirectory = await owner.directory();
    _check();
    final directory = await _prepareIpaDirectory(requestedDirectory);
    _check();
    final ready = File('${directory.path}/studio-${info.ipaSha256}.ipa');
    if (await _cancellation.wait(verifyIpaFile(ready, info))) {
      _check();
      phase?.call('ready');
      progress(1);
      return ready;
    }
    final kind = await FileSystemEntity.type(ready.path, followLinks: false);
    if (kind != FileSystemEntityType.file &&
        kind != FileSystemEntityType.notFound) {
      throw const FileSystemException('Unsafe IPA cache file type');
    }
    final nonce = List.generate(
            16,
            (_) =>
                Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'))
        .join();
    final partial =
        File('${directory.path}/studio-${info.ipaSha256}-$nonce.part');
    final client = owner.clientFactory(settings);
    _client = client;
    IOSink? output;
    StreamIterator<List<int>>? iterator;
    var published = false;
    try {
      phase?.call('downloading');
      final response = await _cancellation.wait(client
          .send(http.Request('GET', Uri.parse(info.ipaUrl!)))
          .timeout(const Duration(seconds: 30)));
      if (response.statusCode != 200) {
        await response.stream.listen((_) {}).cancel();
        throw HttpException('IPA download HTTP ${response.statusCode}');
      }
      if (response.contentLength != null &&
          response.contentLength != info.ipaSize) {
        await response.stream.listen((_) {}).cancel();
        throw const FormatException('IPA download size differs');
      }
      await partial.create(exclusive: true);
      _check();
      output = partial.openWrite();
      iterator =
          StreamIterator(response.stream.timeout(const Duration(seconds: 30)));
      final deadline = DateTime.now().add(const Duration(minutes: 10));
      var received = 0;
      while (await _cancellation.wait(iterator.moveNext())) {
        _check();
        if (DateTime.now().isAfter(deadline)) {
          throw TimeoutException('IPA download deadline');
        }
        final bytes = iterator.current;
        received += bytes.length;
        if (received > info.ipaSize!) {
          throw const FormatException('IPA exceeded expected size');
        }
        output.add(bytes);
        await _cancellation.wait(output.flush());
        _check();
        progress(min(.99, received / info.ipaSize!));
      }
      await output.close();
      output = null;
      _check();
      phase?.call('verifying');
      if (!await _cancellation.wait(verifyIpaFile(partial, info))) {
        throw const FormatException('IPA integrity verification failed');
      }
      _check();
      // Only this updater-owned digest cache may be replaced; no profile data.
      if (await ready.exists()) {
        if (await verifyIpaFile(ready, info)) {
          await partial.delete();
          _check();
          phase?.call('ready');
          progress(1);
          return ready;
        }
        if (await FileSystemEntity.type(ready.path, followLinks: false) !=
            FileSystemEntityType.file) {
          throw const FileSystemException('Unsafe IPA cache replacement');
        }
        await ready.delete();
      }
      _check();
      await partial.rename(ready.path);
      published = true;
      _check();
      phase?.call('ready');
      progress(1);
      return ready;
    } catch (_) {
      try {
        await output?.close();
      } catch (_) {}
      if (await partial.exists()) await partial.delete();
      if (published && cancelled && await verifyIpaFile(ready, info)) {
        await ready.delete();
      }
      rethrow;
    } finally {
      await iterator?.cancel();
      client.close();
      _client = null;
    }
  }

  Future<void> cancel() async {
    _cancellation.cancel();
    _client?.close();
    await _work?.then<void>((_) {}, onError: (Object _) {});
    release();
  }

  void release() {
    if (_running) return;
    if (owner._active == this) owner._active = null;
    _released = true;
  }
}

class IosUpdate {
  static final coordinator = IosUpdateCoordinator();
}
