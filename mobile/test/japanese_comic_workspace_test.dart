import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'Japanese project/run/draft never overwrites the original comic workspace',
      () async {
    final storage = Storage(),
        original = ComicProject.empty(GenerateParams())
          ..title = 'Original tag project';
    final japanese = ComicProject.empty(GenerateParams())
      ..title = 'Japanese pages';
    await storage.setComicProject(original);
    await storage.setComicRun({'id': 'original'});
    await storage.setJapaneseComicProject(japanese);
    await storage.setJapaneseComicRun({'id': 'japanese'});
    await storage.setComicPromptDraft('japanese', '{"input":"tool"}');
    await storage.setComicPromptDraft('convert', '{"input":"convert"}');
    expect((await storage.getComicProject(GenerateParams())).title,
        'Original tag project');
    expect((await storage.getJapaneseComicProject(GenerateParams())).title,
        'Japanese pages');
    expect((await storage.getComicRun())!['id'], 'original');
    expect((await storage.getJapaneseComicRun())!['id'], 'japanese');
    expect(await storage.getComicPromptDraft('japanese'), '{"input":"tool"}');
    expect(await storage.getComicPromptDraft('convert'), '{"input":"convert"}');
    await expectLater(
        storage.getComicPromptDraft('../other'), throwsArgumentError);
  });
  test(
      'confirmed page import backs up only Japanese project with revision guard',
      () async {
    final storage = Storage(), app = AppState(storage: storage);
    addTearDown(app.dispose);
    final original = ComicProject.empty(app.params)..title = 'Keep original';
    await storage.setComicProject(original);
    final c = ComicController(app, workspace: 'japanese');
    addTearDown(c.dispose);
    await c.load();
    c.project.title = 'Japanese previous';
    await c.flush();
    final expected = c.revision;
    await c.importPromptPages(['1girl, garden', '1girl, house'], expected);
    expect(c.project.panels.length, 2);
    expect(c.project.globalParams.width, app.params.width);
    expect(c.step, ComicStep.global);
    expect((await storage.getComicProject(app.params)).title, 'Keep original');
    final prefs = await SharedPreferences.getInstance();
    final backup =
        jsonDecode(prefs.getString('japanese_comic_project_backup_v1')!);
    expect(backup['title'], 'Japanese previous');
    await expectLater(
        c.importPromptPages(['1girl'], expected), throwsStateError);
  });
  test(
      'corrupt Japanese project remains intact instead of becoming an empty saved project',
      () async {
    SharedPreferences.setMockInitialValues(
        {'japanese_comic_project_v1': '{broken'});
    final app = AppState(storage: Storage());
    addTearDown(app.dispose);
    final c = ComicController(app, workspace: 'japanese');
    addTearDown(c.dispose);
    await c.load();
    expect(c.loadError, isNotNull);
    await expectLater(c.flush(), throwsStateError);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('japanese_comic_project_v1'), '{broken');
  });
  test('all new workspace data participates in unified Android data migration',
      () {
    for (final key in [
      'japanese_comic_project_v1',
      'japanese_comic_project_backup_v1',
      'japanese_comic_run_v1',
      'comic_prompt_draft_japanese_v1',
      'comic_prompt_draft_convert_v1'
    ]) {
      expect(UnifiedStorage.dataKeys, contains(key));
    }
  });
}
