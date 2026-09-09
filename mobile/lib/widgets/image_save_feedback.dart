import 'dart:async';
import 'package:flutter/material.dart';
import '../i18n/app_locales.dart';

typedef ImageSaveCopy = ({
  String preparing,
  String done,
  String partial,
  String failed,
  String cancelled,
  String saved,
  String errors,
  String location,
  String close
});

ImageSaveCopy imageSaveCopy(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return (
        preparing: '正在準備下載…',
        done: '圖片儲存成功',
        partial: '部分圖片儲存成功',
        failed: '圖片儲存失敗',
        cancelled: '已取消儲存',
        saved: '已儲存',
        errors: '失敗',
        location: '儲存位置',
        close: '關閉提示'
      );
    case 'en-US':
      return (
        preparing: 'Preparing download…',
        done: 'Images saved',
        partial: 'Some images saved',
        failed: 'Save failed',
        cancelled: 'Save cancelled',
        saved: 'Saved',
        errors: 'Failed',
        location: 'Saved to',
        close: 'Dismiss'
      );
    case 'ja-JP':
      return (
        preparing: '保存を準備中…',
        done: '画像を保存しました',
        partial: '一部の画像を保存しました',
        failed: '保存に失敗しました',
        cancelled: '保存をキャンセルしました',
        saved: '保存済み',
        errors: '失敗',
        location: '保存先',
        close: '閉じる'
      );
    case 'ko-KR':
      return (
        preparing: '다운로드 준비 중…',
        done: '이미지 저장 완료',
        partial: '일부 이미지 저장 완료',
        failed: '저장 실패',
        cancelled: '저장 취소',
        saved: '저장',
        errors: '실패',
        location: '저장 위치',
        close: '닫기'
      );
    default:
      return (
        preparing: '正在准备下载…',
        done: '图片保存成功',
        partial: '部分图片保存成功',
        failed: '图片保存失败',
        cancelled: '已取消保存',
        saved: '已保存',
        errors: '失败',
        location: '保存位置',
        close: '关闭提示'
      );
  }
}

/// Root-overlay feedback stays above fullscreen previews and survives page
/// navigation while an awaited download finishes. No fake byte percentage.
class ImageSaveFeedback {
  final ImageSaveCopy text;
  late final OverlayEntry _entry;
  Timer? _timer;
  bool _closed = false;
  bool _busy = true;
  String _title;
  String _detail = '';
  ImageSaveFeedback._(this.text) : _title = text.preparing;

  static ImageSaveFeedback show(BuildContext context, Object? language) {
    final result = ImageSaveFeedback._(imageSaveCopy(language));
    result._entry = OverlayEntry(
        builder: (context) => Positioned(
              top: MediaQuery.paddingOf(context).top + 72,
              left: 12,
              right: 12,
              child: SafeArea(
                  bottom: false,
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                          maxWidth: 440,
                          maxHeight: MediaQuery.sizeOf(context).height * .5),
                      child: Material(
                        elevation: 12,
                        color: Theme.of(context).colorScheme.surface,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                            side: BorderSide(
                                color: Theme.of(context)
                                    .colorScheme
                                    .outlineVariant)),
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: Semantics(
                              liveRegion: true,
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Row(children: [
                                      if (result._busy)
                                        const SizedBox(
                                            width: 22,
                                            height: 22,
                                            child: CircularProgressIndicator(
                                                strokeWidth: 2.5))
                                      else
                                        Icon(
                                            result._title == result.text.done
                                                ? Icons.check_circle_outline
                                                : Icons.info_outline,
                                            color: Theme.of(context)
                                                .colorScheme
                                                .primary),
                                      const SizedBox(width: 10),
                                      Expanded(
                                          child: Text(result._title,
                                              style: const TextStyle(
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 16))),
                                      if (!result._busy)
                                        IconButton(
                                            tooltip: result.text.close,
                                            onPressed: result.close,
                                            icon: const Icon(Icons.close)),
                                    ]),
                                    if (result._detail.isNotEmpty)
                                      Padding(
                                          padding:
                                              const EdgeInsets.only(top: 8),
                                          child:
                                              SelectableText(result._detail)),
                                    if (result._busy)
                                      const Padding(
                                          padding: EdgeInsets.only(top: 12),
                                          child: LinearProgressIndicator()),
                                  ])),
                        ),
                      ),
                    ),
                  )),
            ));
    Overlay.of(context, rootOverlay: true).insert(result._entry);
    return result;
  }

  void downloading(String title, int total) {
    if (_closed) return;
    _title = '$title ($total)';
    _entry.markNeedsBuild();
  }

  void finish(
      {required int saved,
      int failed = 0,
      String? path,
      bool cancelled = false}) {
    if (_closed) return;
    _busy = false;
    _title = cancelled
        ? text.cancelled
        : saved == 0
            ? text.failed
            : failed > 0
                ? text.partial
                : text.done;
    _detail = cancelled
        ? ''
        : '${text.saved} $saved · ${text.errors} $failed${path == null ? '' : '\n${text.location}：$path'}';
    _entry.markNeedsBuild();
    if (cancelled || (saved > 0 && failed == 0)) {
      _timer = Timer(Duration(seconds: cancelled ? 4 : 8), close);
    }
  }

  void close() {
    if (_closed) return;
    _closed = true;
    _timer?.cancel();
    _entry.remove();
    _entry.dispose();
  }
}
