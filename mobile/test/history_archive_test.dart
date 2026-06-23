import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/history/history_archive.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  test('safe file stems remove path and Windows-invalid characters', () {
    expect(safeFileStem(r'  demo:/\\*?"<>|  '), 'demo__________');
    expect(safeFileStem('...'), 'image');
  });

  test('history ZIP contains images, manifest, and prompts', () async {
    final item = HistoryItem(
      id: '1',
      filePath: r'C:\images\sample.png',
      date: '2026-06-22',
      createdAt: '2026-06-22T12:00:00',
      seed: 42,
      model: 'nai-diffusion-4-5-full',
      width: 832,
      height: 1216,
      prompt: '1girl, solo',
      groupId: 'group-1',
    );
    final bytes = await buildHistoryArchive(
      [item],
      const [
        HistoryGroup(id: 'group-1', name: '角色图', createdAt: '2026-06-22'),
      ],
      (_) async => Uint8List.fromList([1, 2, 3]),
    );

    final archive = ZipDecoder().decodeBytes(bytes);
    final names = archive.files.map((file) => file.name).toSet();
    expect(names, contains('images/角色图/sample.png'));
    expect(names, containsAll(['project.json', 'prompts.md']));

    final manifestFile = archive.files.firstWhere(
      (file) => file.name == 'project.json',
    );
    final manifest = jsonDecode(utf8.decode(manifestFile.content as List<int>))
        as Map<String, dynamic>;
    expect((manifest['items'] as List).single['filePath'],
        'images/角色图/sample.png');
  });
}
