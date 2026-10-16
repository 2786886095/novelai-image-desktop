// Native settings navigation only. Does not invoke or substitute an OS picker.
import 'package:flutter/material.dart';
import 'native_scenario_support.dart';
import 'native_ui_actions.dart';

// Frame/tap drivers let host tests exercise the same production disclosures with
// real WidgetTester hit tests. Native callers use the real engine defaults.
Future<Element?> nativeSettingsControl({
  required String sectionTitle,
  required Key targetKey,
  Future<void> Function()? waitFrame,
  Future<void> Function(Element)? tapDisclosure,
}) async {
  final nextFrame = waitFrame ?? frame;
  final tap = tapDisclosure ?? nativeUiTap;
  List<Element> targets() => nativeUiElements((w) => w.key == targetKey);
  for (var i = 0; i < 100; i++) {
    final found = targets();
    require(found.length <= 1, 'Multiple native settings targets');
    if (found.isNotEmpty) {
      return found.single;
    }
    final headings = nativeUiElements((w) => w is ExpansionTile &&
        w.title is Text && (w.title as Text).data == sectionTitle);
    require(headings.length <= 1, 'Multiple native settings disclosures');
    if (headings.isNotEmpty) {
      // Scrolling cannot mount a default-collapsed SettingsSection child.
      // Use its actual Element: a lazy-list cached heading need not be onstage.
      await tap(headings.single);
      for (var j = 0; j < 40; j++) {
        await nextFrame();
        final exposed = targets();
        require(exposed.length <= 1, 'Multiple native settings targets');
        if (exposed.isNotEmpty) {
          return exposed.single;
        }
      }
      return null;
    }
    final scroll = nativeUiElements((w) => w is Scrollable);
    require(scroll.isNotEmpty, 'Settings has no real scrollable');
    final state = (scroll.first as StatefulElement).state as ScrollableState;
    final p = state.position;
    p.jumpTo((p.pixels + 400).clamp(p.minScrollExtent, p.maxScrollExtent));
    await nextFrame();
  }
  return null;
}
