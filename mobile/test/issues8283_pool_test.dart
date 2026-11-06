import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/tags/offline_tag_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Offline extends OfflineTagStore {
  @override
  Future<List<OfflineTagHit>> artistTags() async => [];
}
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const cache='artist_lab_online_cursor_pool_v3', stamp='artist_lab_online_cursor_saved_at_v3';
  final row={'id':8000,'name':'fixture_artist','post_count':20,'category':1};
  setUp(()=>SharedPreferences.setMockInitialValues({}));
  test('local draw performs zero HTTP calls and never fabricates CSV IDs', () async {
    var calls=0;
    final service=ArtistTagService(offlineTags:_Offline(),clientFactory:(_) { calls++; throw StateError('Must not contact network'); });
    final result=await service.randomWholePool(AppSettings(),source:ArtistPoolSource.local,random:Random(2),sampleSize:1000);
    expect(calls,0); expect(result.source,ArtistPoolSource.local); expect(result.fallback,false);
    expect(result.total,33); expect(result.coverageComplete,false);
  });
  for(final failure in ['503','403','429','empty','invalid','timeout','oversized','wrong-category']) {
    test('$failure falls back once, retains old cache and timestamp', () async {
      SharedPreferences.setMockInitialValues({cache:jsonEncode([row]),stamp:10});
      var calls=0;
      final service=ArtistTagService(offlineTags:_Offline(),clientFactory:(_)=>MockClient((_) async {
        calls++;
        if(failure=='timeout') throw TimeoutException('fixture');
        return http.Response(switch(failure) {
          'empty'=>'[]', 'invalid'=>'not-json', 'oversized'=>' '*(1024*1024+1),
          'wrong-category'=>jsonEncode([{...row,'category':0}]), _=>'blocked',
        },int.tryParse(failure)??200);
      }));
      final result=await service.randomWholePool(AppSettings(),force:true);
      expect(calls,1); expect(result.fallback,true); expect(result.source,ArtistPoolSource.local);
      expect(result.requestedSource,ArtistPoolSource.online); expect(result.warning,isNotEmpty);
      final prefs=await SharedPreferences.getInstance(); expect(prefs.getInt(stamp),10);
      expect(prefs.getString(cache),jsonEncode([row]));
    });
  }
  test('fresh cache does not issue HTTP; force refresh uses only indexed windows',() async {
    var calls=0;
    SharedPreferences.setMockInitialValues({cache:jsonEncode([row]),stamp:DateTime.now().millisecondsSinceEpoch});
    final service=ArtistTagService(offlineTags:_Offline(),clientFactory:(_)=>MockClient((request) async {
      calls++; final p=request.url.queryParameters;
      expect(p['search[order]'],'date'); expect(p['search[category]'],'1');
      expect(p['page'],calls==1?'1':matches(r'^[ab][0-9]+$'));
      return http.Response(jsonEncode([row,{...row,'id':8001,'name':'deprecated','is_deprecated':true},
        {...row,'id':8002,'name':'not_artist','category':0}]),200);
    }));
    final cached=await service.randomWholePool(AppSettings());
    expect(calls,0);expect(cached.fromCache,true);
    final fresh=await service.randomWholePool(AppSettings(),force:true);
    expect(calls,5);expect(fresh.fallback,false);expect(fresh.items.map((e)=>e.name),['fixture_artist']);
    expect(fresh.total,1); expect(fresh.fromCache,false);
  });
  test('empty a cursor uses one bounded b cursor, never deep numbered pages',() async {
    final pages=<String>[];
    final service=ArtistTagService(offlineTags:_Offline(),clientFactory:(_)=>MockClient((request) async {
      pages.add(request.url.queryParameters['page']!);
      return http.Response(jsonEncode(pages.length==1?[row]:[]),200);
    }));
    final result=await service.randomWholePool(AppSettings(),force:true,random:Random(3));
    expect(result.fallback,false);expect(pages.length,5);
    expect(pages[1],startsWith('a')); expect(pages[2],'b${pages[1].substring(1)}');
  });
}
