import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import '../state/app_state.dart';
import '../services/unified_storage.dart';

class AgentSessionControls {
  static const tools = {
    'studio_session_state',
    'studio_set_session_style',
    'studio_generation_policy',
    'studio_style_preview',
    'studio_stop_generation'
  };
  static const paid = {
    'langbai_generate_image',
    'langbai_redraw_image',
    'langbai_inpaint_image',
    'langbai_upscale_image',
    'langbai_director'
  };
  static const styled = {
    'langbai_generate_image',
    'langbai_redraw_image',
    'langbai_inpaint_image'
  };
  final AppState app;
  String? _active;
  Future<void> _tail = Future.value();
  AgentSessionControls(this.app);
  String _key(String id) {
    if (!RegExp(r'^[a-zA-Z0-9_.:-]{1,160}$').hasMatch(id) ||
        id == 'studio-library-ui') throw StateError('请先选择一个已创建的酒馆会话');
    return 'studio.agent.session.${sha256.convert(utf8.encode(id))}';
  }

  Future<T> _serial<T>(Future<T> Function() fn) {
    final next = _tail.then((_) => fn());
    _tail = next.then<void>((_) {}, onError: (Object _) {});
    return next;
  }

  Future<Map<String, dynamic>> read(String id) async {
    final raw = (await UnifiedStorage.preferences()).getString(_key(id));
    dynamic style;
    final saved = raw == null ? <String,dynamic>{} : jsonDecode(raw) as Map<String,dynamic>;
    style = saved['style'];
    if (style != null &&
        (style is! Map ||
            style['id'] is! String ||
            style['name'] is! String ||
            style['prompt'] is! String)) throw StateError('会话风格数据无效');
    return {
      'style': style,
      'mode': saved['mode'] == 'confirm' ? 'confirm' : 'auto',
      'limit': saved['limit'] is int && saved['limit'] >= 0 && saved['limit'] <= 100 ? saved['limit'] : 0,
      'remaining': saved['remaining'] is int && saved['remaining'] >= 0 ? saved['remaining'] : 0
    };
  }

  Future<void> _save(String id, Map<String, dynamic> state) async {
    if (!await (await UnifiedStorage.preferences())
        .setString(_key(id), jsonEncode(state))) {
      throw StateError('会话风格保存未完成');
    }
  }

  void begin(String id) {
    _key(id);
    if (_active != null || app.busy || app.generationQueueRunning) {
      throw StateError('另一个图像任务正在运行，请等待完成');
    }
    _active = id;
  }

  void end(String id) {
    if (_active == id) _active = null;
  }

  void close() {
    if (_active != null) {
      app.cancelGeneration();
      app.api.cancelActiveGeneration();
    }
    _active = null;
  }

  Future<bool> authorize(
      String tool, Map<String, dynamic> args, String id) => _serial(() async {
    if (!paid.contains(tool)) return false;
    _key(id);
    final grant = await read(id);
    if (grant['mode'] != 'auto') return false;
    final count = tool == 'langbai_generate_image' ? (args['count'] ?? 1) : 1;
    if (count is! int || count < 1 || count > 8) throw StateError('生成张数必须为1–8');
    if (grant['limit'] == 0) return true;
    if (count > grant['remaining']) {
      throw StateError('本次自动生成额度不足；请重新授权或改为确认生成');
    }
    grant['remaining'] = grant['remaining'] - count;
    await _save(id, grant);
    return true;
  });

  Future<Map<String, dynamic>> execute(
      String tool, Map<String, dynamic> args, String id) {
    if (tool == 'studio_style_preview') return _preview(args);
    return _serial(() async {
      if (!tools.contains(tool)) throw StateError('会话操作无效');
      final state = await read(id);
      final fields = {
        'studio_session_state': ['sessionId'],
        'studio_set_session_style': ['sessionId', 'presetId'],
        'studio_generation_policy': ['sessionId', 'mode', 'limit'],
        'studio_stop_generation': ['sessionId']
      }[tool]!;
      if (args.keys.any((k) => !fields.contains(k))) {
        throw StateError('未知会话设置参数');
      }
      if (tool == 'studio_set_session_style') {
        final matches = app.settings.stylePromptPresets
            .where((x) => x.id == args['presetId']);
        if (args['presetId'] != null && matches.isEmpty) {
          throw StateError('风格不存在，请刷新列表');
        }
        final p = args['presetId'] == null ? null : matches.first;
        state['style'] =
            p == null ? null : {'id': p.id, 'name': p.name, 'prompt': p.prompt};
        await _save(id, state);
      } else if (tool == 'studio_generation_policy') {
        if (args['mode'] == 'confirm') {
          state['mode'] = 'confirm'; state['remaining'] = 0;
        } else if (args['mode'] == 'auto') {
          final n = args['limit'];
          if (n is! int || n < 0 || n > 100) {
            throw StateError('自动生成上限必须为0–100张，0表示不限');
          }
          state['mode'] = 'auto'; state['limit'] = n; state['remaining'] = n;
        } else {
          throw StateError('请选择确认生成或全自动');
        }
      } else if (tool == 'studio_stop_generation') {
        state['mode'] = 'confirm'; state['remaining'] = 0;
        if (_active == id) {
          app.cancelGeneration();
          app.api.cancelActiveGeneration();
        }
      }
      await _save(id,state);
      return read(id);
    });
  }

  Future<Map<String, dynamic>> _preview(Map<String, dynamic> args) async {
    if (args.keys.any((k) => !['presetId', 'imageId', 'large'].contains(k))) {
      throw StateError('未知预览参数');
    }
    final matches =
        app.settings.stylePromptPresets.where((p) => p.id == args['presetId']);
    if (matches.isEmpty) throw StateError('风格不存在，请刷新列表');
    final p = matches.first, images = p.previewImages;
    if (images.isEmpty) return {'dataUrl': null, 'images': []};
    final selected = args['imageId'] is String
        ? images.where((x) => x.id == args['imageId'])
        : images.where((x) => x.id == p.coverImageId);
    if (args['imageId'] is String && selected.isEmpty) {
      throw StateError('预览图不存在');
    }
    final entry = selected.isEmpty ? images.first : selected.first;
    final file = File(entry.filePath);
    if (!await file.exists() || await file.length() > 32 * 1024 * 1024) {
      throw StateError('预览图过大或已失效');
    }
    final bytes = await file.readAsBytes(),
        decoder = img.findDecoderForData(bytes);
    final info = decoder?.startDecode(bytes);
    if (info == null || info.width * info.height > 40000000) {
      throw StateError('预览图尺寸过大或格式无效');
    }
    final decoded = decoder!.decodeFrame(0);
    if (decoded == null) throw StateError('预览图格式无效');
    final size = args['large'] == true ? 1280 : 320,
        ratio = min(1.0, size / max(decoded.width, decoded.height));
    final resized = img.copyResize(decoded,
        width: max(1, (decoded.width * ratio).round()),
        height: max(1, (decoded.height * ratio).round()));
    // New pixels strip metadata; arbitrary paths never accepted from the caller.
    final clean =
        img.Image(width: resized.width, height: resized.height, numChannels: 3);
    img.compositeImage(clean, resized);
    final jpg = img.encodeJpg(clean, quality: args['large'] == true ? 78 : 65);
    if (jpg.length > 900000) throw StateError('预览图超出传输限制');
    return {
      'dataUrl': 'data:image/jpeg;base64,${base64Encode(jpg)}',
      'imageId': entry.id,
      'images': images.map((x) => {'id': x.id, 'name': x.name}).toList()
    };
  }
}
