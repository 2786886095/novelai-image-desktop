// Host authoring only: production artist service and actual loopback TLS/CONNECT.
// No native receipt, public network, fake HTTP response client or trust bypass.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';
import '../integration_test/native_ui_tls_fixture.dart';
import '../integration_test/native_os_scenarios.dart' as os;
import '../integration_test/native_ui_scenarios.dart' as ui;

void main() {
  // This test process deliberately uses real verified HTTP, not widget-test 400s.
  setUp(() { HttpOverrides.global = null; SharedPreferences.setMockInitialValues({}); });
  test('native UI fixture terminates production artist pagination without dropping first-page filtering coverage', () async {
    final tls = await NativeUiTlsFixture.open(Uint8List(0));
    final settings = AppSettings(proxyMode:'custom',proxyUrl:tls.proxyUrl,proxyForUpdate:true);
    final future = ArtistTagService().popular(settings,limit:5,force:true,includeCurated:false);
    var completed = false;
    try {
      final rows = await future.timeout(const Duration(seconds:2),onTimeout:() => []);
      completed = rows.isNotEmpty;
      expect(completed,isTrue,reason:'successful fixture pages must reach a terminal empty page');
      expect(rows.map((r)=>r.name),['native_artist_a','native_artist_b']);
      expect(tls.requests.where((r)=>r['path']=='/tags.json'),hasLength(2));
      expect(tls.requests.every((r)=>r['method']=='GET'&&r['host']=='danbooru.donmai.us'&&r['bodyBytes']==0&&r['authorizationSha256']==null),isTrue);
      expect(tls.errors,isEmpty); expect(tls.blockedAuthorities,isEmpty);
    } finally {
      tls.mode='offline'; await future.timeout(const Duration(seconds:5)); await tls.close();
    }
  },timeout:const Timeout(Duration(seconds:10)));
  test('native UI fixture keeps duplicate deprecated and invalid first page and emits empty later pages', () async {
    final tls=await NativeUiTlsFixture.open(Uint8List(0));
    final client=createProxyHttpClient(AppSettings(proxyMode:'custom',proxyUrl:tls.proxyUrl,proxyForUpdate:true),scope:ProxyScope.update);
    try {
      final first=await client.get(Uri.parse('https://danbooru.donmai.us/tags.json?page=1'));
      expect(first.statusCode,200);
      expect(first.body,'[{"id":1,"name":"native_artist_a","post_count":100},{"id":2,"name":"native_artist_b","post_count":80},{"id":3,"name":"deprecated_artist","post_count":90,"is_deprecated":true},{"id":1,"name":"native_artist_a","post_count":100},{"id":0,"name":"invalid_artist","post_count":10}]');
      for(final page in [2,3,999]) {
        final response=await client.get(Uri.parse('https://danbooru.donmai.us/tags.json?page=$page'));
        expect(response.statusCode,200); expect(response.body,'[]');
      }
      expect(tls.errors,isEmpty);
    } finally {client.close();await tls.close();}
  },timeout:const Timeout(Duration(seconds:10)));
  test('coverage gap producers retain diagnostic reasons outside strict Agent capability proof', () {
    final lines=<String>[];
    runZoned(() {
      os.coverageGap('output-management','folder-choice-history-link needs an actual native OS picker; no path substitution was used');
      os.coverageGap('metadata-import','Full online official runtime/default local bytes/format/privacy scenario remains a separate native journey');
      os.coverageGap('updates','iOS has release-link check but no production Android APK download/install bridge; Android updater calls are not promoted to iOS parity');
      ui.coverageGap('tools','Not certified by mounting tool routes. Full six exposed tool outputs/error/cancel flows require separate operational scenarios.');
    },zoneSpecification:ZoneSpecification(print:(_,__,___,line)=>lines.add(line)));
    expect(lines,hasLength(4));
    for(final line in lines) {
      expect(line,startsWith('FEATURE_NATIVE_COVERAGE_GAP:'));
      expect(line, isNot(contains('FEATURE_ACCEPTANCE_')));
      final record=jsonDecode(line.substring('FEATURE_NATIVE_COVERAGE_GAP:'.length)) as Map;
      expect(record['status'],'not-certified'); expect(record['kind'],'diagnostic');
      expect(record['paidCalls'],0); expect(record['reason'],isNotEmpty);
      expect(record.keys.toSet(),{'sourceSha','profileSha','platform','testEntry','feature','status','kind','reason','paidCalls'});
    }
    expect(lines[0],contains('no path substitution was used'));
    expect(lines[1],contains('separate native journey'));
    expect(lines[2],contains('not promoted to iOS parity'));
    expect(lines[3],contains('separate operational scenarios'));
  });

}
