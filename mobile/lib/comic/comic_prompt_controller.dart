import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import '../services/generation_scope.dart';
import 'comic_prompt.dart';

class ComicTextReply {
  final bool ok, truncated;
  final String text, message;
  const ComicTextReply(
      {required this.ok,
      this.text = '',
      this.message = '',
      this.truncated = false});
}

typedef ComicPromptTransport = Future<ComicTextReply> Function(
    ComicPromptRequest request, GenerationScope scope);

/// Each composer owns its request, draft, cancellation and accepted result. It
/// never touches the global image queue or automatically retries paid requests.
class ComicPromptComposerController extends ChangeNotifier {
  final ComicPromptTransport transport;
  final String Function() contextFingerprint;
  final Future<String?> Function() readDraft;
  final Future<void> Function(String) writeDraft;
  ComicPromptComposerController(
      {required this.transport,
      required this.contextFingerprint,
      required this.readDraft,
      required this.writeDraft});
  ComicPromptFormat format = ComicPromptFormat.japanesePage;
  String input = '',
      output = '',
      notes = '',
      raw = '',
      reason = '',
      message = '',
      error = '';
  List<String> beats = [];
  int? pages = 1;
  bool manual = false, loaded = false, busy = false, unused = false;
  String? draftError;
  String? _recommendedContext, _outputContext;
  int? _outputTotal;
  int _outputRevision = 0, _requestSequence = 0;
  GenerationScope? _scope;
  Timer? _saveTimer;
  Future<void> _writes = Future.value();
  bool _disposed = false;
  String _baseContext() => sha256
      .convert(
          utf8.encode(jsonEncode([input, format.value, contextFingerprint()])))
      .toString();
  bool get validInput =>
      input.trim().isNotEmpty && input.length <= maxComicInputChars;
  bool get validPages =>
      pages != null && pages! >= 1 && pages! <= maxComicTotalPages;
  bool get recommendationCurrent {
    try {
      return _recommendedContext == _baseContext();
    } catch (_) {
      return false;
    }
  }

  bool get outputCurrent {
    try {
      return _outputContext == _baseContext() && _outputTotal == pages;
    } catch (_) {
      return false;
    }
  }

  bool get canGenerate =>
      loaded &&
      draftError == null &&
      !busy &&
      validInput &&
      validPages &&
      (manual || recommendationCurrent);
  ComicPageResult get editedResult => parseComicPromptPages(output, pages ?? 0);
  bool get canImport => !busy && outputCurrent && editedResult.exact;
  bool get canContinue {
    if (!canGenerate || !outputCurrent) return false;
    final parsed = parseComicPromptPages(output, _lineCount(output));
    return parsed.exact &&
        parsed.lines.isNotEmpty &&
        parsed.lines.length < (pages ?? 0);
  }

  int get completedPages => _lineCount(output);
  int _lineCount(String text) =>
      text.split(RegExp(r'\r?\n')).where((x) => x.trim().isNotEmpty).length;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    if (loaded) return;
    try {
      final saved = await readDraft();
      if (saved != null) {
        if (utf8.encode(saved).length > 2 * 1024 * 1024) {
          throw const FormatException('Draft exceeds 2 MiB');
        }
        final d = jsonDecode(saved);
        if (d is! Map ||
            d['schema'] != 'langbai.comic-prompt-draft/1' ||
            d['input'] is! String ||
            d['output'] is! String ||
            !['jp-page', 'single-panel'].contains(d['format']) ||
            d['manual'] is! bool ||
            (d['pages'] != null &&
                (d['pages'] is! int || d['pages'] < 1 || d['pages'] > 30))) {
          throw const FormatException('Invalid draft');
        }
        input = d['input'];
        output = d['output'];
        manual = d['manual'];
        pages = d['pages'];
        if (input.length > maxComicInputChars) {
          throw const FormatException('Draft input exceeds limit');
        }
        format = d['format'] == 'single-panel'
            ? ComicPromptFormat.singlePanel
            : ComicPromptFormat.japanesePage;
        for (final key in ['notes', 'raw', 'reason']) {
          if (d[key] != null && d[key] is! String) {
            throw const FormatException('Invalid draft text');
          }
        }
        notes = d['notes'] ?? '';
        raw = d['raw'] ?? '';
        reason = d['reason'] ?? '';
        beats = d['beats'] is List
            ? (d['beats'] as List).whereType<String>().take(30).toList()
            : [];
        _recommendedContext =
            d['recommendedContext'] is String ? d['recommendedContext'] : null;
        _outputContext =
            d['outputContext'] is String ? d['outputContext'] : null;
        _outputTotal = d['outputTotal'] is int ? d['outputTotal'] : null;
      }
    } catch (e) {
      draftError = e.toString();
      message = 'draftDamaged';
    }
    loaded = true;
    _notify();
  }

  void setInput(String value) {
    input = value;
    error = '';
    unused = false;
    _changed();
  }

  void setFormat(ComicPromptFormat value) {
    format = value;
    error = '';
    unused = false;
    _changed();
  }

  void setManual(bool value) {
    manual = value;
    _changed();
  }

  void setPages(String value) {
    pages = int.tryParse(value);
    error = '';
    _changed();
  }

  void editOutput(String value) {
    output = value;
    _outputRevision++;
    _changed();
  }

  void _changed() {
    if (_disposed) return;
    _notify();
    if (loaded && draftError == null) {
      _saveTimer?.cancel();
      _saveTimer = Timer(const Duration(milliseconds: 250),
          () => unawaited(flush().catchError((Object _) {})));
    }
  }

  String _draft() => jsonEncode({
        'schema': 'langbai.comic-prompt-draft/1',
        'format': format.value,
        'input': input,
        'output': output,
        'manual': manual,
        'pages': validPages ? pages : null,
        'reason': reason,
        'beats': beats,
        'notes': notes,
        'raw': raw,
        'recommendedContext': _recommendedContext,
        'outputContext': _outputContext,
        'outputTotal': _outputTotal
      });
  Future<void> flush() {
    _saveTimer?.cancel();
    if (!loaded || draftError != null) return Future.value();
    final snapshot = _draft();
    final next = _writes.then((_) async {
      if (utf8.encode(snapshot).length > 2 * 1024 * 1024) {
        throw const FormatException('Draft exceeds 2 MiB');
      }
      await writeDraft(snapshot);
    });
    _writes = next.then<void>((_) {}, onError: (Object e) {
      error = e.toString();
      _notify();
    });
    return next;
  }

  void reportError(Object value) {
    error = value.toString();
    _notify();
  }

  void cancel() {
    _scope?.cancel();
    message = 'cancelled';
    _notify();
  }

  Future<void> recommend() async {
    if (!loaded || draftError != null || busy || !validInput) return;
    await _execute(recommend: true, next: false);
  }

  Future<void> generate({bool next = false}) async {
    if (!canGenerate || next && !canContinue) return;
    await _execute(recommend: false, next: next);
  }

  Future<void> _execute({required bool recommend, required bool next}) async {
    String captured;
    try {
      captured = _baseContext();
    } catch (e) {
      error = e.toString();
      _notify();
      return;
    }
    final revision = _outputRevision,
        chosenPages = pages,
        chosenFormat = format;
    final existing = next
        ? parseComicPromptPages(output, _lineCount(output)).lines
        : <String>[];
    final from = existing.length + 1,
        count = recommend
            ? 1
            : min(chosenFormat.batchLimit, chosenPages! - existing.length);
    final sequence = ++_requestSequence;
    bool current() {
      try {
        return !_disposed &&
            sequence == _requestSequence &&
            captured == _baseContext() &&
            (recommend || pages == chosenPages && _outputRevision == revision);
      } catch (_) {
        return false;
      }
    }

    final scope = GenerationScope(
        cancellationMessage: 'Comic prompt request cancelled',
        beforeSubmit: () {
          if (!current()) throw StateError('Comic request context changed');
        });
    _scope = scope;
    busy = true;
    error = '';
    unused = false;
    message = 'requesting';
    _notify();
    final request = ComicPromptRequest(
        requestId: 'comic-${DateTime.now().microsecondsSinceEpoch}-$sequence',
        action: recommend ? 'recommend' : 'generate',
        format: chosenFormat,
        input: input,
        pages: count,
        totalPages: recommend ? 1 : chosenPages!,
        batchFrom: from,
        continuity: next
            ? [notes, ...existing].join('\n').substring(0,
                min(maxComicInputChars, [notes, ...existing].join('\n').length))
            : '');
    try {
      final reply = await scope.run(() => transport(request, scope));
      if (!current() || scope.cancelled) {
        unused = true;
        message = scope.cancelled ? 'cancelled' : 'staleResult';
        return;
      }
      raw = reply.text;
      if (!reply.ok) throw StateError(reply.message);
      if (recommend) {
        if (reply.truncated) {
          throw const FormatException('Truncated recommendation');
        }
        final result = parseComicRecommendation(reply.text);
        pages = result.pages;
        reason = result.reason;
        beats = result.beats;
        _recommendedContext = captured;
        message = 'recommended';
      } else {
        final result = parseComicPromptPages(reply.text, count,
            truncated: reply.truncated);
        if (!result.exact) {
          message = 'invalidResult';
          error = '${result.countStatus}: ${result.lines.length}/$count';
          return;
        }
        output = [...existing, ...result.lines].join('\n');
        notes = result.notes;
        _outputContext = captured;
        _outputTotal = chosenPages;
        _outputRevision++;
        message = completedPages == pages ? 'complete' : 'batchComplete';
      }
    } catch (e) {
      if (scope.cancelled) {
        message = 'cancelled';
      } else if (!current()) {
        unused = true;
        message = 'staleResult';
      } else {
        error = e.toString();
        message = 'requestFailed';
      }
    } finally {
      if (identical(_scope, scope)) {
        _scope = null;
        busy = false;
      }
      _changed();
    }
  }

  List<String> pagesToImport() {
    if (!canImport) throw StateError('Comic result is incomplete or stale');
    return List.unmodifiable(editedResult.lines);
  }

  @override
  void dispose() {
    if (_disposed) return;
    _saveTimer?.cancel();
    _scope?.cancel();
    unawaited(flush().catchError((Object _) {}));
    _disposed = true;
    super.dispose();
  }
}
