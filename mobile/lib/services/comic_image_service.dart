import 'dart:convert';
import '../models/nai_models.dart';
import 'storage.dart';
import 'openai_images.dart';
import 'generation_scope.dart';
import 'proxy_http_client.dart';

/// Private host binding. It includes the secure-storage credential version, not
/// the secret. The queue additionally compares the loaded secret before submit.
String comicImageBinding(AppSettings s) => jsonEncode([
      s.imageProvider,
      s.apiBaseUrl,
      s.imageBaseUrl,
      s.allowCustomEndpoint,
      if (s.imageProvider == 'openai-images') s.compatibleImage,
      s.proxyMode,
      s.proxyUrl,
      s.proxyForNai,
      s.proxyForAi,
      s.imageOutputDir,
      s.saveToGallery,
    ]);

Future<String?> comicCredential(Storage storage, AppSettings s) =>
    s.imageProvider == 'openai-images'
        ? storage.getCompatibleImageKey(
            s.compatibleImage['credentialId'] as String? ?? '')
        : storage.getToken();

CompatibleImageConfig _config(
        AppSettings s, String key) =>
    CompatibleImageConfig(
        baseUrl: s.compatibleImage['baseUrl'] as String? ?? '',
        model: s.compatibleImage['model'] as String? ?? '',
        apiKey: key,
        responseFormat:
            s.compatibleImage['responseFormat'] as String? ?? 'auto');

/// Only standard Images fields and explicitly configured gateway extensions are
/// sent. Native sampler/seed/negative/reference controls are never reinterpreted.
Map<String, Object> compatibleComicRequest(
    AppSettings s, GenerateParams params, GenerateExtras extras,
    {String? size}) {
  if (extras.preciseReferences.isNotEmpty ||
      extras.vibeImages.isNotEmpty ||
      extras.charCaptions.isNotEmpty) {
    throw StateError('兼容漫画文生图未发送参考图或角色分段；请清除本批参考，或切回 NovelAI 原生服务');
  }
  final config = _config(s, '');
  compatibleImageEndpoint(config.baseUrl);
  return compatibleImageBody(config,
      prompt: params.positivePrompt,
      n: 1,
      size: size ?? s.compatibleImage['size'] as String? ?? 'auto',
      extensions: Map<String, Object?>.from(
          s.compatibleImage['extensions'] as Map? ?? {}));
}

class SavedComicImagesException implements Exception {
  final List<HistoryItem> items;
  final String message;
  SavedComicImagesException(List<HistoryItem> items, this.message)
      : items = List.unmodifiable(items);
  @override
  String toString() => message;
}

/// Runs under the controller's request-owned scope. Cancellation closes only
/// this request; valid partial images are saved before any failure is surfaced.
Future<List<HistoryItem>> generateCompatibleComicImages(
    {required Storage storage,
    required AppSettings snapshot,
    required GenerateParams params,
    required GenerateExtras extras,
    required String groupId,
    required void Function() ensureCurrent,
    String? size}) async {
  final body = compatibleComicRequest(snapshot, params, extras, size: size);
  final key = await comicCredential(storage, snapshot);
  ensureCurrent();
  GenerationScope.current?.credentials(key ?? '', snapshot);
  if (key == null || key.trim().isEmpty) throw StateError('请先配置兼容图片服务密钥');
  final cancellation = CompatibleImageCancellation();
  final detach = GenerationScope.current?.attach(cancellation.cancel);
  final items = <HistoryItem>[];
  try {
    final batch = await generateCompatibleImages(_config(snapshot, key),
        prompt: body['prompt'] as String,
        size: body['size'] as String,
        n: 1,
        extensions: Map<String, Object?>.from(
            snapshot.compatibleImage['extensions'] as Map? ?? {}),
        cancellation: cancellation,
        beforeSubmit: () {
          ensureCurrent();
          GenerationScope.current?.credentials(key, snapshot);
        },
        clientForUri: (uri) =>
            createProxyHttpClientForUri(snapshot, uri, scope: ProxyScope.ai));
    var historyFailed = false;
    for (final bytes in batch.images) {
      try {
        items.add(await storage.saveCompatibleImage(bytes, body, snapshot,
            groupId: groupId));
      } on SavedImageHistoryException catch (e) {
        items.add(e.item);
        historyFailed = true;
      }
    }
    if (historyFailed) {
      throw SavedComicImagesException(items, '图片已保存，但历史记录写入失败，已停止后续漫画请求');
    }
    if (!batch.complete) {
      final message = batch.cancelled
          ? '漫画请求已停止，已保存图片保留'
          : batch.error?.message ?? '漫画图片请求未完成';
      if (items.isNotEmpty) throw SavedComicImagesException(items, message);
      throw StateError(message);
    }
    return items;
  } on SavedComicImagesException {
    rethrow;
  } catch (_) {
    if (items.isNotEmpty) {
      throw SavedComicImagesException(items, '图片已保存，但本分镜未完整完成；已停止后续请求');
    }
    rethrow;
  } finally {
    detach?.call();
  }
}
