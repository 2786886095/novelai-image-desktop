import 'dart:async';
import 'dart:math';

/// UI-only one-shot approvals. Tool arguments never count as user authorization.
class AgentOperationApprovals {
  final Duration timeout;
  final Map<String,
          ({Map<String, dynamic> data, Completer<bool> answer, Timer timer})>
      _pending = {};
  AgentOperationApprovals({this.timeout = const Duration(minutes: 5)});
  Future<bool> wait(
      String session, String tool, Map<String, dynamic> parameters) {
    if (!RegExp(r'^[a-zA-Z0-9_.:-]{1,160}$').hasMatch(session) ||
        session == 'studio-library-ui') throw StateError('请先选择酒馆会话');
    final count =
        tool == 'langbai_generate_image' ? (parameters['count'] ?? 1) : 1;
    if (count is! int || count < 1 || count > 8) {
      throw StateError('生成张数必须为 1–8');
    }
    if (_pending.containsKey(session)) throw StateError('当前会话已有待确认操作');
    final answer = Completer<bool>();
    final id = List.generate(
            24,
            (_) =>
                Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'))
        .join();
    final image = [
      'langbai_generate_image',
      'langbai_redraw_image',
      'langbai_inpaint_image',
      'langbai_upscale_image',
      'langbai_director'
    ].contains(tool);
    final data = <String, dynamic>{
      'id': id,
      'tool': tool,
      'kind': image ? 'image' : 'operation',
      'title': image
          ? '确认生图'
          : (['langbai_convert_prompt', 'langbai_reverse_prompt'].contains(tool)
              ? '确认调用模型（可能收费）'
              : '确认软件操作'),
      'count': count,
      'parameters': parameters,
      'createdAt': DateTime.now().millisecondsSinceEpoch
    };
    _pending[session] = (
      data: data,
      answer: answer,
      timer: Timer(timeout, () => _finish(session, false))
    );
    return answer.future;
  }

  void _finish(String session, bool approved) {
    final item = _pending.remove(session);
    if (item == null) return;
    item.timer.cancel();
    if (!item.answer.isCompleted) item.answer.complete(approved);
  }

  Map<String, dynamic>? read(String session) => _pending[session]?.data;
  void resolve(String session, String id, bool approved) {
    if (_pending[session]?.data['id'] != id) throw StateError('确认已过期或不属于当前会话');
    _finish(session, approved);
  }

  void cancelGeneration(String session) {
    final item = _pending[session];
    if (item != null &&
        (item.data['kind'] == 'image' ||
            item.data['tool'] == 'langbai_tasks' ||
            item.data['parameters']?['action'] == 'comic.generation.start')) {
      _finish(session, false);
    }
  }

  void cancelOperation(String session, String action) {
    final item = _pending[session];
    if (item?.data['tool'] == 'langbai_software_action' &&
        item?.data['parameters']?['action'] == action) {
      _finish(session, false);
    }
  }

  void close() {
    for (final session in _pending.keys.toList()) {
      _finish(session, false);
    }
  }
}
