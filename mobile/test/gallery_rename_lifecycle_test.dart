import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

class _RenameState extends AppState {
  final calls = <String>[];
  @override
  Future<void> renameHistory(String id, String name) async {
    calls.add('image/$id/$name');
  }

  @override
  Future<void> renameGroup(String id, String name) async {
    calls.add('group/$id/$name');
  }
}

void main() {
  for (final fixture in [
    (TargetPlatform.android, const Size(360, 800)),
    (TargetPlatform.iOS, const Size(390, 844)),
    (TargetPlatform.iOS, const Size(1024, 768)),
    (TargetPlatform.windows, const Size(1200, 800)),
  ]) {
    for (final kind in ['image', 'group']) {
      for (final action in ['cancel', 'save']) {
        testWidgets(
            'gallery rename ${fixture.$1.name} ${fixture.$2} $kind $action',
            (tester) async {
          debugDefaultTargetPlatformOverride = fixture.$1;
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = fixture.$2;
          final directory =
              Directory.systemTemp.createTempSync('gallery-rename-');
          final image =
              File('${directory.path}${Platform.pathSeparator}QA-Rename.png');
          final bytes = base64Decode(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
          image.writeAsBytesSync(bytes);
          final state = _RenameState();
          state.settings.language = 'zh-CN';
          state.groups = const [
            HistoryGroup(
                id: 'qa-group', name: 'QA Group', createdAt: '2026-10-02')
          ];
          state.selectedGroupId = 'qa-group';
          state.history = [
            HistoryItem(
                id: 'qa-image',
                filePath: image.path,
                date: '2026-10-02',
                createdAt: '2026-10-02T09:50:00',
                seed: 42,
                model: 'nai-diffusion-5-full',
                width: 832,
                height: 1216,
                prompt: 'QA fixture. No generation.',
                groupId: 'qa-group')
          ];
          addTearDown(() async {
            tester.view.reset();
            debugDefaultTargetPlatformOverride = null;
            state.dispose();
            PaintingBinding.instance.imageCache
              ..clear()
              ..clearLiveImages();
            await Future<void>.delayed(const Duration(milliseconds: 20));
            if (directory.existsSync()) directory.deleteSync(recursive: true);
          });
          await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
              value: state, child: const MaterialApp(home: GalleryScreen())));
          await tester.pumpAndSettle();
          if (kind == 'image') {
            await tester.tap(find.text('QA-Rename.png'));
            await tester.pumpAndSettle();
            for (var scroll = 0; scroll < 4; scroll++) {
              await tester.drag(
                  find.byType(ListView).last, const Offset(0, -400));
              await tester.pumpAndSettle();
            }
            await tester.tap(find.byIcon(Icons.drive_file_rename_outline));
          } else {
            await tester.tap(find.byType(PopupMenuButton<String>));
            await tester.pumpAndSettle();
            await tester.tap(find.text('重命名分组'));
          }
          await tester.pumpAndSettle();
          expect(find.byType(AlertDialog), findsOneWidget);
          if (action == 'save') {
            await tester.enterText(
                find.descendant(
                    of: find.byType(AlertDialog),
                    matching: find.byType(TextField)),
                'QA_RENAMED');
          }
          await tester.tap(find.text(action == 'cancel' ? '取消' : '保存'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 60));
          await tester.pump(const Duration(milliseconds: 400));
          final errors = <String>[];
          Object? error;
          while ((error = tester.takeException()) != null) {
            errors.add(error.toString());
          }
          final disposed =
              errors.any((e) => e.contains('used after being disposed'));
          final dependent =
              errors.any((e) => e.contains('_dependents.isEmpty'));
          debugPrint(
              'GALLERY_RENAME=${fixture.$1.name}/${fixture.$2}/$kind/$action/errors=${errors.length}/disposed=$disposed/dependent=$dependent/calls=${state.calls}');
          expect(errors, isEmpty,
              reason:
                  'Controller must remain live until the dialog reverse transition completes.');
          expect(
              state.calls,
              action == 'cancel'
                  ? <String>[]
                  : [
                      '$kind/${kind == 'image' ? 'qa-image' : 'qa-group'}/QA_RENAMED'
                    ]);
          expect(image.readAsBytesSync(), bytes);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          debugDefaultTargetPlatformOverride = null;
        });
      }
    }
  }
}
