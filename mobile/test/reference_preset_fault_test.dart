import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final target in [
    (TargetPlatform.android, const Size(360, 800)),
    (TargetPlatform.iOS, const Size(390, 844)),
    (TargetPlatform.iOS, const Size(1024, 768)),
  ]) {
    for (final mode in ['success', 'partial', 'throw']) {
      testWidgets('preset selection fault ${target.$1.name} ${target.$2} $mode',
          (tester) async {
        SharedPreferences.setMockInitialValues({});
        final root = (await tester.runAsync(() async =>
            Directory.systemTemp.createTempSync('owned-preset-fault-')))!;
        final image = File('${root.path}/owned.png');
        image.writeAsBytesSync(img.encodePng(img.Image(width: 8, height: 12)));
        final original = image.readAsBytesSync();
        final state = AppState(storage: Storage());
        final calls = <String>[];
        state.referencePresets.addAll(List.generate(2, (i) => ReferencePreset(
            id: 'owned-$i', name: 'OWNED_PRESET_$i', group: '',
            kind: ReferencePresetKind.vibe, filePath: image.path,
            createdAt: '2026-10-03T00:00:00Z', infoExtracted: .4, strength: .65)));
        debugDefaultTargetPlatformOverride = target.$1;
        tester.view.physicalSize = target.$2;
        tester.view.devicePixelRatio = 1;
        addTearDown(() async {
          tester.view.resetPhysicalSize(); tester.view.resetDevicePixelRatio();
          debugDefaultTargetPlatformOverride = null;
          state.dispose(); PaintingBinding.instance.imageCache.clear();
          PaintingBinding.instance.imageCache.clearLiveImages();
          expect(image.readAsBytesSync(), original);
          if (root.parent.path != Directory.systemTemp.path ||
              !root.path.split(Platform.pathSeparator).last.startsWith('owned-preset-fault-')) {
            throw StateError('Unsafe owned fixture cleanup');
          }
          await tester.runAsync(() async { for(var i=0;root.existsSync();i++) {
            try {await root.delete(recursive:true);} on FileSystemException {
              if(i>=20) rethrow; await Future<void>.delayed(const Duration(milliseconds:100));
            }
          }});
        });
        try {
        await tester.pumpWidget(ChangeNotifierProvider.value(value: state,
          child: MaterialApp(theme: StudioTheme.light(), home: Scaffold(
            body: Builder(builder:(context)=>TextButton(
              key: const ValueKey('open-owned-presets'), child: const Text('Open owned presets'),
              onPressed:()=>showReferencePresetLibrary(context,onApplyPreset:(preset) async {
                calls.add(preset.id);
                if(mode=='throw') throw StateError('PRIVATE_KEY_QA_FAKE');
                if(mode=='partial'&&preset.id=='owned-1') return 'Owned preset failure';
                return null;
              }),
            )),
          )),
        ));
        await tester.tap(find.byKey(const ValueKey('open-owned-presets')));
        await tester.pumpAndSettle();
        await tester.runAsync(()=>Future<void>.delayed(const Duration(milliseconds:30)));
        await tester.pumpAndSettle();
        for(var i=0;i<2;i++) {
          final f=find.byType(Checkbox).at(i);
          // Isolate the apply/error path from the card double-tap recognizer.
          // Native/gesture selection acceptance is a separate pending gate.
          tester.widget<Checkbox>(f).onChanged!(true);
          await tester.pumpAndSettle();
          expect(tester.widget<Checkbox>(f).value,isTrue);
        }
        final apply=find.byKey(const ValueKey('reference-preset-apply-fixed'));
        expect(tester.widget<FilledButton>(apply).onPressed,isNotNull);
        await tester.tap(apply); await tester.pump();
        await tester.pump(const Duration(milliseconds:700));
        expect(tester.takeException(),isNull);
        expect(calls,hasLength(2));
        if(mode=='success') {
          expect(find.byType(ReferencePresetLibraryPanel),findsNothing);
        } else {
          expect(find.byType(ReferencePresetLibraryPanel),findsOneWidget);
          expect(tester.widget<FilledButton>(apply).onPressed,isNotNull);
          expect(find.byType(SnackBar),findsOneWidget);
          expect(find.textContaining('PRIVATE_KEY'),findsNothing);
        }
        await tester.pumpWidget(const SizedBox.shrink()); await tester.pumpAndSettle();
        } finally {
          debugDefaultTargetPlatformOverride = null;
        }
      });
    }
  }
}
