import 'package:flutter/foundation.dart';

import '../models/nai_models.dart';
import '../services/nai_api.dart';
import '../services/storage.dart';

/// Central app state — port of src/store.ts (Phase 1 subset).
class AppState extends ChangeNotifier {
  final _api = NaiApi();
  final _storage = Storage();

  GenerateParams params = GenerateParams();
  AccountSummary account = const AccountSummary(hasToken: false);
  List<HistoryItem> history = [];
  HistoryItem? current;

  bool booted = false;
  bool generating = false;
  String status = '就绪';
  int batchCount = 1;

  Future<void> load() async {
    final token = await _storage.getToken();
    params = await _storage.getParams();
    history = await _storage.getHistory();
    current = history.isNotEmpty ? history.first : null;
    if (token != null && token.isNotEmpty) {
      account = await _api.fetchAccount(token);
    }
    booted = true;
    notifyListeners();
  }

  void setParam(void Function(GenerateParams p) update) {
    update(params);
    notifyListeners();
    _storage.setParams(params);
  }

  void setBatchCount(int n) {
    batchCount = n.clamp(1, 16);
    notifyListeners();
  }

  /// Verify and persist a token. Returns an error message, or null on success.
  Future<String?> setToken(String token) async {
    try {
      final summary = await _api.verifyToken(token);
      await _storage.setToken(token.trim());
      account = summary;
      notifyListeners();
      return null;
    } catch (e) {
      return e.toString().replaceFirst('Exception: ', '');
    }
  }

  Future<void> clearToken() async {
    await _storage.clearToken();
    account = const AccountSummary(hasToken: false);
    notifyListeners();
  }

  Future<void> generate() async {
    if (!account.hasToken) {
      status = '请先在设置中配置 API Token';
      notifyListeners();
      return;
    }
    if (params.positivePrompt.trim().isEmpty) {
      status = '请输入正面提示词';
      notifyListeners();
      return;
    }
    final token = await _storage.getToken();
    if (token == null) return;

    generating = true;
    final total = batchCount.clamp(1, 16);
    int done = 0;
    notifyListeners();

    try {
      for (var i = 0; i < total; i++) {
        if (!generating) break;
        status = total > 1 ? '批量生成 ${i + 1}/$total...' : '正在生成...';
        notifyListeners();

        // Increment seed per image when a fixed seed is set.
        final p = params.copy();
        if (params.seed > 0) p.seed = params.seed + i;

        final (bytes, seed) = await _api.generate(token, p);
        final item = await _storage.saveImage(bytes, p, seed);
        history.insert(0, item);
        current = item;
        done++;
        notifyListeners();
      }
      status = done > 1 ? '批量生成完成，共 $done 张' : '生成完成';
      // Refresh anlas balance after spending.
      account = await _api.fetchAccount(token);
    } catch (e) {
      status = '生成失败：${e.toString().replaceFirst('Exception: ', '')}';
    } finally {
      generating = false;
      notifyListeners();
    }
  }

  void cancel() {
    generating = false;
    status = '已取消';
    notifyListeners();
  }

  void selectImage(HistoryItem item) {
    current = item;
    notifyListeners();
  }

  Future<void> deleteHistory(String id) async {
    await _storage.deleteHistory(id);
    history.removeWhere((e) => e.id == id);
    if (current?.id == id) current = history.isNotEmpty ? history.first : null;
    notifyListeners();
  }
}
