import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../state/app_state.dart';

Map<String, String> promptAssistantLabels(Object? language) =>
    switch (normalizeAppLocaleCode(language)) {
      'zh-TW' => {
          'optimize': '優化提示詞',
          'custom': '提示詞助手',
          'instruction': '修改要求',
          'source': '目前提示詞',
          'preview': '預覽結果',
          'run': '執行',
          'retry': '重試',
          'apply': '套用',
          'cancel': '取消',
          'busy': '正在處理…',
          'stale': '原提示詞已變更，請重新執行。'
        },
      'en-US' => {
          'optimize': 'Optimize prompt',
          'custom': 'Prompt assistant',
          'instruction': 'Requested changes',
          'source': 'Current prompt',
          'preview': 'Preview',
          'run': 'Run',
          'retry': 'Retry',
          'apply': 'Apply',
          'cancel': 'Cancel',
          'busy': 'Working…',
          'stale': 'The prompt changed. Run again.'
        },
      'ja-JP' => {
          'optimize': 'プロンプトを最適化',
          'custom': 'プロンプト助手',
          'instruction': '変更内容',
          'source': '現在のプロンプト',
          'preview': 'プレビュー',
          'run': '実行',
          'retry': '再試行',
          'apply': '適用',
          'cancel': 'キャンセル',
          'busy': '処理中…',
          'stale': '元のプロンプトが変更されました。再実行してください。'
        },
      'ko-KR' => {
          'optimize': '프롬프트 최적화',
          'custom': '프롬프트 도우미',
          'instruction': '변경 요청',
          'source': '현재 프롬프트',
          'preview': '미리보기',
          'run': '실행',
          'retry': '재시도',
          'apply': '적용',
          'cancel': '취소',
          'busy': '처리 중…',
          'stale': '원본 프롬프트가 변경되었습니다. 다시 실행하세요.'
        },
      _ => {
          'optimize': '优化提示词',
          'custom': '提示词助手',
          'instruction': '修改要求',
          'source': '当前提示词',
          'preview': '预览结果',
          'run': '执行',
          'retry': '重试',
          'apply': '应用',
          'cancel': '取消',
          'busy': '正在处理…',
          'stale': '原提示词已变化，请重新执行。'
        },
    };

class PromptAssistantDialog extends StatefulWidget {
  final String kind;
  final String source;
  final bool Function(String) isCurrent;

  const PromptAssistantDialog({
    super.key,
    required this.kind,
    required this.source,
    required this.isCurrent,
  });

  @override
  State<PromptAssistantDialog> createState() => _PromptAssistantDialogState();
}

class _PromptAssistantDialogState extends State<PromptAssistantDialog> {
  final instruction = TextEditingController();
  String result = '', error = '';
  bool busy = false;

  @override
  void dispose() {
    instruction.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    if (busy) return;
    setState(() {
      busy = true;
      result = '';
      error = '';
    });
    try {
      final response = await context.read<AppState>().assistPositivePrompt(
            currentPrompt: widget.source,
            instruction: instruction.text,
            kind: widget.kind,
          );
      if (!mounted) return;
      setState(() {
        if (response.ok && response.text.trim().isNotEmpty) {
          result = response.text.trim();
        } else {
          error = response.message;
        }
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final labels =
        promptAssistantLabels(context.watch<AppState>().settings.language);
    final stale = !widget.isCurrent(widget.source);
    return AlertDialog(
      title: Text(labels[widget.kind]!),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(labels['source']!),
                SelectableText(widget.source),
                if (widget.kind == 'custom') ...[
                  const SizedBox(height: 12),
                  TextField(
                      controller: instruction,
                      maxLines: 3,
                      maxLength: 8000,
                      onChanged: (_) => setState(() {
                            result = '';
                            error = '';
                          }),
                      decoration: InputDecoration(
                          labelText: labels['instruction'],
                          border: const OutlineInputBorder())),
                ],
                if (busy) Text(labels['busy']!),
                if (error.isNotEmpty)
                  Text(error,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                if (result.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(labels['preview']!),
                  SelectableText(result),
                ],
                if (stale)
                  Text(labels['stale']!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
              ]),
        ),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(labels['cancel']!)),
        TextButton(
            onPressed: busy ||
                    (widget.kind == 'optimize'
                        ? widget.source.trim().isEmpty
                        : instruction.text.trim().isEmpty)
                ? null
                : _run,
            child: Text(result.isEmpty ? labels['run']! : labels['retry']!)),
        FilledButton(
            onPressed: busy || result.isEmpty || stale
                ? null
                : () => Navigator.pop(context, result),
            child: Text(labels['apply']!)),
      ],
    );
  }
}
