import 'package:flutter/foundation.dart' show debugPrint;
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/resource_database_service.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override
  Future<String?> getApplicationSupportPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final scenario in ['corrupt', '503', 'badRange']) {
    test(
        'catalog recovery preserves installed, rollback & related data: $scenario',
        () async {
      final root =
          await Directory.systemTemp.createTemp('resource-retry-test-');
      final old = PathProviderPlatform.instance;
      PathProviderPlatform.instance = _Paths(root.path);
      addTearDown(() async {
        PathProviderPlatform.instance = old;
        await root.delete(recursive: true);
      });
      final sub =
          Directory.fromUri(root.uri.resolve('resources/autocomplete/'));
      await sub.create(recursive: true);
      final existing = [
        'tag_catalog.db',
        'tag_catalog.db.previous',
        'cooccurrence-v2.db'
      ];
      File file(String n) => File.fromUri(sub.uri.resolve(n));
      for (final n in existing) {
        await file(n).writeAsString(n);
      }
      final partial = file('tag_catalog.db.part'),
          id = ResourceDatabaseId.tagCatalog;
      await partial.writeAsString('saved prefix');
      final requests = <Uri>[];
      final ranges = <String?>[];
      http.Client client() => MockClient((req) async {
        requests.add(req.url);
        ranges.add(req.headers['range']);
        return scenario == 'badRange'
            ? http.Response('oops', 206, headers: {'content-range': 'bytes 0-3/46772224'})
            : http.Response('Unavailable', 503);
      });
      if (scenario == 'corrupt') {
        final f = await partial.open(mode: FileMode.append);
        await f.truncate(resourceDatabaseDefinitions[id]!.downloadSize);
        await f.close();
        await expectLater(ResourceDatabaseService.shared.install(id, clientFactory: client),
            throwsA(predicate((e) => e.toString().contains('SHA-256'))));
        expect(await partial.exists(), false);
        expect(requests, isEmpty);
      }
      await expectLater(ResourceDatabaseService.shared.install(id, clientFactory: client),
          throwsA(anything));
      expect(requests.map((r) => r.host), [
        'github.com', if (scenario != 'badRange') 'api.github.com',
      ]);
      expect(ranges, everyElement(scenario == 'corrupt' ? isNull : 'bytes=12-'));
      if (scenario != 'corrupt') {
        expect(await partial.readAsString(), 'saved prefix');
      }
      for (final n in existing) {
        expect(await file(n).readAsString(), n);
      }
      debugPrint(
          '$scenario: requests=${requests.length} ranges=$ranges, installed/previous/related unchanged');
    });
  }
}
