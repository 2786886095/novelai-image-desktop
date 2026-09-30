import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/services/storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'batch catalog advertises connected edits and rejects unimplemented file actions',
      () async {
    final app = AppState();
    addTearDown(app.dispose);
    final r =
        await SoftwareActions(app).execute('langbai_software_capabilities', {});
    final actions = (r['actions'] as Map).keys;
    expect(
        actions,
        containsAll([
          'batch.project.read',
          'batch.project.update',
          'batch.items.update',
          'batch.candidates.select'
        ]));
    for (final action in [
      'batch.items.import',
      'batch.project.export',
      'batch.references.import',
      'batch.results.clear'
    ]) {
      expect(actions, isNot(contains(action)));
      await expectLater(
          SoftwareActions(app)
              .execute('langbai_software_action', {'action': action}),
          throwsStateError);
    }
  });
  test('bulk file deletion rejects a directory instead of reporting success',
      () async {
    final dir = await Directory.systemTemp.createTemp('batch-delete-probe-');
    try {
      await expectLater(Storage().deleteHistoryFiles([dir.path]),
          throwsA(isA<FileSystemException>()));
    } finally {
      await dir.delete();
    }
  });
}
