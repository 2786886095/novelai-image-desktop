import 'dart:io';

import 'package:flutter/foundation.dart';

import '../models/nai_models.dart';
import '../services/nai_api.dart';
import '../services/storage.dart';

class AppState extends ChangeNotifier {
  final api = NaiApi();
  final storage = Storage();

  GenerateParams params = GenerateParams();
  GenerateExtras extras = GenerateExtras();
  I2IParams i2i = I2IParams();
  AugmentOptions augmentOptions = AugmentOptions();
  AppSettings settings = AppSettings();
  AccountSummary account = const AccountSummary(hasToken: false);
  List<HistoryItem> history = [];
  List<HistoryGroup> groups = [];
  HistoryItem? current;
  WorkingImage? workbenchImage;

  bool booted = false;
  bool busy = false;
  String status = '就绪';
  int batchCount = 1;
  String selectedGroupId = '';
  String inpaintModel = 'nai-diffusion-4-5-curated-inpainting';
  int upscaleScale = 2;
  String directorTool = 'bg-removal';
  ReversePromptMode reverseMode = ReversePromptMode.tags;
  ReversePromptMode convertMode = ReversePromptMode.natural;
  String reverseResult = '';
  String convertInput = '';
  String convertResult = '';

  Future<void> load() async {
    settings = await storage.getSettings();
    params = await storage.getParams();
    history = await storage.getHistory();
    groups = await storage.getGroups();
    current = history.isNotEmpty ? history.first : null;
    final token = await storage.getToken();
    if (token != null && token.isNotEmpty) {
      account = await api.fetchAccount(token, settings);
    }
    booted = true;
    notifyListeners();
  }

  void setParam(void Function(GenerateParams p) update) {
    update(params);
    notifyListeners();
    storage.setParams(params);
  }

  Future<void> setSettings(void Function(AppSettings s) update) async {
    update(settings);
    await storage.setSettings(settings);
    notifyListeners();
  }

  void markChanged() {
    notifyListeners();
  }

  void setBatchCount(int n) {
    batchCount = n.clamp(1, 16);
    notifyListeners();
  }

  Future<String?> setToken(String token) async {
    try {
      final summary = await api.verifyToken(token, settings);
      await storage.setToken(token.trim());
      account = summary;
      notifyListeners();
      return null;
    } catch (e) {
      return e.toString().replaceFirst('Exception: ', '');
    }
  }

  Future<void> clearToken() async {
    await storage.clearToken();
    account = const AccountSummary(hasToken: false);
    notifyListeners();
  }

  Future<void> refreshAnlas() async {
    final token = await storage.getToken();
    if (token == null) return;
    account = await api.fetchAccount(token, settings);
    status = '积分已刷新';
    notifyListeners();
  }

  Future<void> setSecret(String key, String value) async {
    if (key == 'vision') await storage.setVisionKey(value.trim());
    if (key == 'convert') await storage.setConvertKey(value.trim());
    if (key == 'tag') await storage.setTagKey(value.trim());
  }

  Future<void> setWorkbenchPath(String filePath) async {
    final bytes = await File(filePath).readAsBytes();
    final dims = readImageDimensions(bytes);
    workbenchImage = WorkingImage(filePath: filePath, width: dims.$1, height: dims.$2);
    status = '已加载工作台图片';
    notifyListeners();
  }

  Future<void> setWorkbenchFromHistory(HistoryItem item) async {
    current = item;
    await setWorkbenchPath(item.filePath);
  }

  void clearWorkbench() {
    workbenchImage = null;
    status = '已清空工作台图片，当前为文生图';
    notifyListeners();
  }

  void addCharacter() {
    if (extras.charCaptions.length >= 6) return;
    extras.charCaptions.add(CharCaptionItem());
    notifyListeners();
  }

  void removeCharacter(int index) {
    if (index < 0 || index >= extras.charCaptions.length) return;
    extras.charCaptions.removeAt(index);
    notifyListeners();
  }

  Future<void> runTextOrImage() async {
    if (workbenchImage == null) {
      await generate();
    } else {
      await generateI2I();
    }
  }

  Future<void> generate() async {
    await _withTokenRun((token) async {
      if (params.positivePrompt.trim().isEmpty) throw Exception('请输入正面提示词');
      final total = batchCount.clamp(1, 16);
      final items = <HistoryItem>[];
      for (var i = 0; i < total; i++) {
        status = total > 1 ? '批量生成 ${i + 1}/$total...' : '正在生成...';
        notifyListeners();
        final p = params.copy();
        if (params.seedMode != 'random' && params.seed > 0) p.seed = params.seed + i;
        final (images, seed) = await api.generate(token, settings, p, extras);
        if (images.isEmpty) throw Exception('API 返回成功但没有图片');
        for (final bytes in images) {
          items.add(await storage.saveImage(bytes, p, seed, feature: 't2i', groupId: selectedGroupId.ifEmptyNull));
        }
      }
      _prependHistory(items);
      status = '生成完成：${items.length} 张';
      account = await api.fetchAccount(token, settings);
    });
  }

  Future<void> generateI2I() async {
    await _withTokenRun((token) async {
      if (params.positivePrompt.trim().isEmpty) throw Exception('请输入正面提示词');
      final image = await _workbenchBytes();
      status = '正在图生图...';
      notifyListeners();
      final (images, seed) = await api.img2img(token, settings, params, extras, image, i2i);
      if (images.isEmpty) throw Exception('图生图成功但没有图片');
      final items = <HistoryItem>[];
      for (final bytes in images) {
        items.add(await storage.saveImage(bytes, params, seed, feature: 'i2i', groupId: selectedGroupId.ifEmptyNull));
      }
      _prependHistory(items);
      status = '图生图完成';
      account = await api.fetchAccount(token, settings);
    });
  }

  Future<void> inpaint(Uint8List maskBytes) async {
    await _withTokenRun((token) async {
      final image = await _workbenchBytes();
      final dims = workbenchImage;
      if (dims == null) throw Exception('请先加载原图');
      status = '正在局部重绘...';
      notifyListeners();
      final (images, seed) = await api.inpaint(token, settings, params, image, maskBytes, inpaintModel, dims.width, dims.height);
      if (images.isEmpty) throw Exception('重绘成功但没有图片');
      final items = <HistoryItem>[];
      for (final bytes in images) {
        items.add(await storage.saveImage(bytes, params, seed, feature: 'inpaint', model: inpaintModel, width: dims.width, height: dims.height, groupId: selectedGroupId.ifEmptyNull));
      }
      _prependHistory(items);
      status = '局部重绘完成';
      account = await api.fetchAccount(token, settings);
    });
  }

  Future<void> upscale() async {
    await _withTokenRun((token) async {
      final image = await _workbenchBytes();
      final dims = workbenchImage;
      if (dims == null) throw Exception('请先加载图片');
      status = '正在超分 ${upscaleScale}x...';
      notifyListeners();
      final bytes = await api.upscale(token, settings, image, dims.width, dims.height, upscaleScale);
      final item = await storage.saveImage(bytes, params, 0, feature: 'upscale', model: 'upscale', width: dims.width * upscaleScale, height: dims.height * upscaleScale, groupId: selectedGroupId.ifEmptyNull);
      _prependHistory([item]);
      status = '超分完成';
      account = await api.fetchAccount(token, settings);
    });
  }

  Future<void> augment() async {
    await _withTokenRun((token) async {
      final image = await _workbenchBytes();
      final dims = workbenchImage;
      if (dims == null) throw Exception('请先加载图片');
      status = '正在后期处理...';
      notifyListeners();
      final images = await api.augment(token, settings, image, dims.width, dims.height, directorTool, augmentOptions);
      if (images.isEmpty) throw Exception('后期处理成功但没有图片');
      final items = <HistoryItem>[];
      for (final bytes in images) {
        items.add(await storage.saveImage(bytes, params, 0, feature: 'director-$directorTool', model: 'director-$directorTool', width: dims.width, height: dims.height, groupId: selectedGroupId.ifEmptyNull));
      }
      _prependHistory(items);
      status = '后期处理完成';
      account = await api.fetchAccount(token, settings);
    });
  }

  Future<void> reversePrompt() async {
    final image = await _workbenchBytes();
    final key = await storage.getVisionKey() ?? '';
    busy = true;
    status = '正在 AI 反推...';
    notifyListeners();
    final res = await api.reversePrompt(settings: settings, apiKey: key, image: image, mode: reverseMode);
    busy = false;
    reverseResult = res.ok ? res.text : '';
    status = res.ok ? '反推完成' : res.message;
    notifyListeners();
  }

  Future<void> convertPrompt() async {
    final key = await storage.getConvertKey() ?? '';
    busy = true;
    status = '正在转换提示词...';
    notifyListeners();
    final res = await api.convertPrompt(settings: settings, apiKey: key, text: convertInput, mode: convertMode);
    busy = false;
    convertResult = res.ok ? res.text : '';
    status = res.ok ? '转换完成' : res.message;
    notifyListeners();
  }

  void applyPrompt(String prompt) {
    setParam((p) => p.positivePrompt = prompt);
    status = '已复用到生成提示词';
    notifyListeners();
  }

  Future<List<TagSuggestion>> suggestTags(String query) async {
    final key = await storage.getTagKey() ?? '';
    return api.searchTags(settings, query, 12, apiKey: key);
  }

  Future<List<String>> detectModels(String kind) async {
    if (kind == 'reverse') return api.listModels(settings.visionApiUrl, await storage.getVisionKey() ?? '');
    return api.listModels(settings.convertApiUrl, await storage.getConvertKey() ?? '');
  }

  Future<void> createGroup(String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    groups = [...groups, HistoryGroup(id: DateTime.now().microsecondsSinceEpoch.toString(), name: trimmed, createdAt: DateTime.now().toIso8601String())];
    await storage.writeGroups(groups);
    notifyListeners();
  }

  Future<void> deleteGroup(String id) async {
    groups = groups.where((g) => g.id != id).toList();
    history = history.map((h) => h.groupId == id ? HistoryItem.fromJson({...h.toJson(), 'groupId': null}) : h).toList();
    await storage.writeGroups(groups);
    await storage.writeHistory(history);
    notifyListeners();
  }

  void selectImage(HistoryItem item) {
    current = item;
    notifyListeners();
  }

  Future<void> deleteHistory(String id) async {
    await storage.deleteHistory(id);
    history.removeWhere((e) => e.id == id);
    if (current?.id == id) current = history.isNotEmpty ? history.first : null;
    notifyListeners();
  }

  Future<void> _withTokenRun(Future<void> Function(String token) fn) async {
    final token = await storage.getToken();
    if (token == null || token.isEmpty) {
      status = '请先在设置中配置 API Token';
      notifyListeners();
      return;
    }
    busy = true;
    notifyListeners();
    try {
      await fn(token);
    } catch (e) {
      status = e.toString().replaceFirst('Exception: ', '');
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<Uint8List> _workbenchBytes() async {
    final img = workbenchImage;
    if (img == null) throw Exception('请先加载工作台图片');
    return File(img.filePath).readAsBytes();
  }

  void _prependHistory(List<HistoryItem> items) {
    history.insertAll(0, items);
    if (items.isNotEmpty) current = items.first;
    notifyListeners();
  }

  static (int, int) readImageDimensions(Uint8List b) {
    if (b.length > 24 && b[0] == 0x89 && b[1] == 0x50) {
      final w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
      final h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
      return (w, h);
    }
    return (0, 0);
  }
}

extension on String {
  String? get ifEmptyNull => trim().isEmpty ? null : this;
}
