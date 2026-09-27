import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/portable_projects.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
}

MapEntry<String, List<int>> capsule(String kind,
    {String path = 'profiles/custom.json'}) {
  final data = utf8.encode('{"synthetic":true}');
  final zip = Archive()..addFile(ArchiveFile('files/$path', data.length, data));
  final manifest = utf8.encode(jsonEncode({
    'version': 1,
    'kind': kind,
    'files': [
      {
        'name': path,
        'bytes': data.length,
        'hash': sha256.convert(data).toString()
      }
    ],
    'omitted': []
  }));
  zip.addFile(ArchiveFile('manifest.json', manifest.length, manifest));
  final bytes = ZipEncoder().encode(zip)!;
  return MapEntry('$kind-${sha256.convert(bytes)}.zip', bytes);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  setUp(() {
    root = Directory.systemTemp.createTempSync('portable-mobile-');
    PathProviderPlatform.instance = _Paths(root.path);
  });
  tearDown(() {
    root.deleteSync(recursive: true);
  });
  test(
      'desktop capsules round trip byte-identically without loading native plugins',
      () async {
    final agent = capsule('agent'),
        detective = capsule('detective', path: 'run/status.json');
    final archive = Archive();
    for (final e in [agent, detective]) {
      archive.addFile(
          ArchiveFile('portable-projects/${e.key}', e.value.length, e.value));
    }
    const selected = {'tavernAgent', 'styleLab'};
    final inspected = PortableProjects.inspect(archive, selected);
    await PortableProjects.restore(inspected);
    await PortableProjects.restore(inspected);
    final output = Archive();
    await PortableProjects.export(output, selected);
    expect(output.findFile('portable-projects/${agent.key}')!.content,
        agent.value);
    expect(output.findFile('portable-projects/${detective.key}')!.content,
        detective.value);
    expect(Directory('${root.path}/TavernAgent').existsSync(), false);
    expect(File('${root.path}/profiles/custom.json').existsSync(), false);
  });
  test(
      'native category exclusion applies again when exporting retained capsules',
      () async {
    final agent = capsule('agent');
    await PortableProjects.restore({agent.key: agent.value});
    final output = Archive();
    await PortableProjects.export(output, {'agentWorkspace', 'workspaceData'});
    expect(output.files, isEmpty);
  });
  test('rejects modified contents and traversal before storage', () async {
    final agent = capsule('agent');
    expect(() => PortableProjects.validate(agent.key, [...agent.value, 0]),
        throwsFormatException);
    for (final path in ['../outside', 'a\\b', 'C:/outside', 'CON.txt', 'a.']) {
      final item = capsule('agent', path: path);
      expect(() => PortableProjects.validate(item.key, item.value),
          throwsFormatException);
    }
    expect(root.listSync(), isEmpty);
  });
}
