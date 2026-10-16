import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/comic/comic_asset_store.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/comic/comic_project_transfer.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  test('managed selected ZIP writes real CRC-valid output without system share',
      () async {
    final root = await Directory.systemTemp.createTemp('managed-comic-');
    addTearDown(() => root.delete(recursive: true));
    final input = File('${root.path}/source.png')
          ..writeAsBytesSync(im.encodePng(im.Image(width: 8, height: 8))),
        assets = ComicAssetStore(root: () async => root);
    final project = ComicProject.empty(GenerateParams())
      ..panels = [
        ComicPanel(
            id: 'panel',
            index: 1,
            title: 'Panel',
            prompt: 'A book.',
            candidates: [
              ComicCandidate(
                  id: 'chosen',
                  historyItemId: 'h1',
                  outputPath: input.path,
                  createdAt: 'now'),
              ComicCandidate(
                  id: 'not-chosen',
                  historyItemId: 'h2',
                  outputPath: 'missing',
                  createdAt: 'now')
            ],
            selectedCandidateId: 'chosen')
      ];
    final result = await assets.exportSelected(
        project, portableComicProject(project), () {},
        shareResult: false);
    expect(result['saved'], true);
    expect(result['shared'], false);
    expect(result['shareError'], isNull);
    final zip = ZipDecoder().decodeBytes(
        await File(result['filePath']).readAsBytes(),
        verify: true);
    expect(zip.files.where((f) => f.name.startsWith('images/') && f.isFile),
        hasLength(1));
    expect(zip.files.any((f) => f.name == 'project.json'), true);
    expect(await input.exists(), true);
  });
  test('exclusive writer collision never deletes or changes existing bytes',
      () async {
    final root = await Directory.systemTemp.createTemp('managed-exclusive-');
    addTearDown(() => root.delete(recursive: true));
    final file = File('${root.path}/saved.zip')..writeAsBytesSync([10, 20, 30]);
    await expectLater(writeComicArchiveExclusive(file, [1, 2, 3], () {}),
        throwsA(isA<FileSystemException>()));
    expect(await file.readAsBytes(), [10, 20, 30]);
  });
  test('cancelled new write removes only the file created by this call',
      () async {
    final root = await Directory.systemTemp.createTemp('managed-cancel-');
    addTearDown(() => root.delete(recursive: true));
    final file = File('${root.path}/new.zip');
    var checks = 0;
    await expectLater(
        writeComicArchiveExclusive(file, [1, 2, 3], () {
          if (++checks == 2) throw StateError('Synthetic cancel');
        }),
        throwsStateError);
    expect(await file.exists(), false);
  });
}
