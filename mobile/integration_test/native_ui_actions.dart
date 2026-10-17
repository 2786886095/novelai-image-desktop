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

bool _nativeTargetReceivesPointer(Element element, RenderBox box) {
  final position = box.localToGlobal(box.size.center(Offset.zero));
  final result = HitTestResult();
  GestureBinding.instance.hitTestInView(result, position, View.of(element).viewId);
  final descendants = <RenderObject>{};
  void collect(RenderObject object) {
    descendants.add(object);
    object.visitChildren(collect);
  }
  collect(box);
  return result.path.any((entry) => descendants.contains(entry.target));
}

Future<void> _revealNativePointerTarget(Element element) async {
  // ensureVisible can leave a cached child outside the outer viewport when
  // a non-scrollable shrink-wrapped GridView nests inside the actual ListView.
  // Correct only by real ancestor scroll positions; never call the callback.
  for (var attempt = 0; attempt < 8; attempt++) {
    final object = element.findRenderObject();
    require(object is RenderBox && object.attached && object.hasSize,
        'Native target has no laid-out RenderBox');
    final box = object as RenderBox;
    if (_nativeTargetReceivesPointer(element, box)) return;
    final ancestors = <ScrollableState>[];
    element.visitAncestorElements((parent) {
      if (parent is StatefulElement && parent.state is ScrollableState) {
        ancestors.add(parent.state as ScrollableState);
      }
      return true;
    });
    var moved = false;
    for (final ancestor in ancestors.reversed) {
      final viewport = ancestor.context.findRenderObject();
      final position = ancestor.position;
      if (viewport is! RenderBox || !viewport.attached || !viewport.hasSize ||
          !position.hasContentDimensions) continue;
      final target = box.localToGlobal(box.size.center(Offset.zero));
      final center = viewport.localToGlobal(viewport.size.center(Offset.zero));
      final delta = position.axis == Axis.vertical
          ? target.dy - center.dy : target.dx - center.dx;
      final next = (position.pixels + delta)
          .clamp(position.minScrollExtent, position.maxScrollExtent).toDouble();
      if ((next - position.pixels).abs() < .5) continue;
      position.jumpTo(next);
      moved = true;
      await frame();
      break;
    }
    if (!moved) break;
  }
  final object = element.findRenderObject();
  require(object is RenderBox && object.attached && object.hasSize &&
      _nativeTargetReceivesPointer(element, object),
      'Native target is not on the actual pointer hit path');
}

int _pointer = 9300;
Future<void> nativeUiTap(Element element) async {
  await Scrollable.ensureVisible(element,
      alignment: .5, duration: Duration.zero);
  await frame();
  await _revealNativePointerTarget(element);
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
