// Actual Flutter hit-testing/gesture dispatch on the native engine, not callback
// substitution, WidgetTester, fake platform channels or an alternate UI.
import 'dart:async';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'native_scenario_support.dart';

bool nativeUiVisible(Element element) {
  var visible = true;
  element.visitAncestorElements((parent) {
    final w = parent.widget;
    if (w is Offstage && w.offstage || w is IgnorePointer && w.ignoring) {
      visible = false;
      return false;
    }
    return true;
  });
  return visible && (ModalRoute.of(element)?.isCurrent ?? true);
}

List<Element> nativeUiElements(bool Function(Widget) test) =>
    elements(test).where(nativeUiVisible).toList();
Future<void> nativeUiWait(bool Function() test, String reason,
    {int frames = 400}) async {
  for (var i = 0; i < frames; i++) {
    if (test()) return;
    await frame();
  }
  throw StateError('Native UI did not reach: $reason');
}

int _pointer = 9300;
Future<void> nativeUiTap(Element element) async {
  await Scrollable.ensureVisible(element,
      alignment: .5, duration: Duration.zero);
  await frame();
  final object = element.findRenderObject();
  require(object is RenderBox && object.attached && object.hasSize,
      'Native target has no laid-out RenderBox');
  final box = object as RenderBox,
      position = box.localToGlobal(box.size.center(Offset.zero)),
      id = ++_pointer;
  GestureBinding.instance.handlePointerEvent(PointerDownEvent(
      pointer: id, position: position, kind: PointerDeviceKind.touch));
  await Future<void>.delayed(const Duration(milliseconds: 40));
  GestureBinding.instance.handlePointerEvent(PointerUpEvent(
      pointer: id, position: position, kind: PointerDeviceKind.touch));
  await frame();
  await frame();
}

Future<void> nativeUiTextTap(String text) async {
  await nativeUiWait(
      () => nativeUiElements((w) => w is Text && w.data == text).isNotEmpty,
      'text $text');
  await nativeUiTap(nativeUiElements((w) => w is Text && w.data == text).last);
}

Future<void> nativeUiDrag(Element handle, Element destination) async {
  await Scrollable.ensureVisible(handle,
      alignment: .3, duration: Duration.zero);
  await frame();
  final start = handle.findRenderObject() as RenderBox,
      end = destination.findRenderObject() as RenderBox;
  final from = start.localToGlobal(start.size.center(Offset.zero)),
      to = end.localToGlobal(end.size.center(Offset.zero)),
      id = ++_pointer;
  GestureBinding.instance.handlePointerEvent(PointerDownEvent(
      pointer: id, position: from, kind: PointerDeviceKind.touch));
  await frame();
  var prior = from;
  for (var i = 1; i <= 20; i++) {
    final at = Offset.lerp(from, to, i / 20)!;
    GestureBinding.instance.handlePointerEvent(PointerMoveEvent(
        pointer: id,
        position: at,
        delta: at - prior,
        kind: PointerDeviceKind.touch));
    prior = at;
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
  GestureBinding.instance.handlePointerEvent(
      PointerUpEvent(pointer: id, position: to, kind: PointerDeviceKind.touch));
  await frame();
  await frame();
}

Future<void> nativeUiMount(AppState app, Widget child, {Key? shellKey}) async {
  runApp(ChangeNotifierProvider.value(
      value: app,
      child: MaterialApp(
          key: shellKey,
          locale: const Locale('en', 'US'),
          home: Center(
              child: SizedBox(
                  width: 360,
                  height: 740,
                  child: Builder(
                      builder: (context) => MediaQuery(
                          data: MediaQuery.of(context).copyWith(
                              size: const Size(360, 740),
                              disableAnimations: true),
                          child: child)))))));
  await frame();
  await frame();
}
