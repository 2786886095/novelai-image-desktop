import 'dart:math';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Service extends ArtistTagService {
 final calls=<ArtistPoolSource>[];
 @override
 Future<ArtistPoolSample> randomWholePool(AppSettings settings,{int sampleSize=32,Random? random,bool force=false,ArtistPoolSource source=ArtistPoolSource.online}) async {
   calls.add(source);
   return ArtistPoolSample(List.generate(40,(i)=>ArtistTagRecord(i+1,'fixture_$i',100)),40,
     source:ArtistPoolSource.local,requestedSource:source,fallback:source==ArtistPoolSource.online);
 }
}
Future<void> reveal(WidgetTester tester,Finder target) async {
 final scroll=find.descendant(of:find.byKey(const PageStorageKey<String>('random-artist-lab-scroll')),matching:find.byType(Scrollable)).first;
 final position=tester.state<ScrollableState>(scroll).position;
 for(var i=0;i<100 && target.evaluate().isEmpty;i++) {
  position.jumpTo((position.pixels+400).clamp(0,position.maxScrollExtent));await tester.pumpAndSettle();
 }
 expect(target,findsWidgets);await tester.ensureVisible(target.first);await tester.pumpAndSettle();
}
Future<void> capture(WidgetTester tester,String name) async {
 final dir=Platform.environment['RESULT_SCREENSHOTS'];if(dir==null)return;
 await tester.runAsync(() async {
  final boundary=tester.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('capture')));
  final image=await boundary.toImage();final bytes=await image.toByteData(format:ui.ImageByteFormat.png);
  await Directory(dir).create(recursive:true);await File('$dir/$name.png').writeAsBytes(bytes!.buffer.asUint8List());image.dispose();
 });
}
void main() {
 setUpAll(() async {
   final font = FontLoader('Roboto')..addFont(rootBundle.load('assets/ui-fonts/LXGWWenKaiLite-Regular.ttf'));
   await font.load();
   final icons=FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
   await icons.load();
 });
 for(final size in [const Size(320,700),const Size(420,860),const Size(800,360)]) {
 testWidgets('source, fixed count, zero/swapped tag range persist at $size',(tester) async {
  tester.view.devicePixelRatio=1;tester.view.physicalSize=size;addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({
   'artist_lab_random_v1_poolSource':'online', 'artist_lab_random_v1_wholePool':true,
   'artist_lab_random_v1_fixedArtistCount':true,'artist_lab_random_v1_minArtists':4,
   'artist_lab_random_v1_maxArtists':7,'artist_lab_random_v1_count':3,
   'artist_lab_random_v1_customTags':'tag_a, tag_b, tag_c',
   'artist_lab_random_v1_customTagModes':jsonEncode({'tag_a':'random','tag_b':'random','tag_c':'random'}),
   'artist_lab_random_v1_minRandomCustomTags':0,'artist_lab_random_v1_maxRandomCustomTags':0,
  });
  final app=AppState();addTearDown(app.dispose);final service=_Service();
  Future<void> mount() async {
   await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(theme:StudioTheme.light(),home:
    RepaintBoundary(key:const ValueKey('capture'),child:RandomArtistLabScreen(onBack:(){},artistService:service)))));
   await tester.pumpAndSettle();
  }
  await mount();expect(service.calls.last,ArtistPoolSource.online);
  expect(find.byKey(const ValueKey('artist-pool-fallback')),findsOneWidget);
  await capture(tester,'issues8283-source-${size.width.toInt()}');
  final source=find.byKey(const ValueKey('artist-pool-source'));
  await tester.tap(source);await tester.pumpAndSettle();
  await tester.tap(find.text('本地画师库（离线可用）').last);await tester.pumpAndSettle();
  expect(service.calls.last,ArtistPoolSource.local);
  expect(find.byKey(const ValueKey('artist-pool-fallback')),findsNothing);
  final fixed=find.byKey(const ValueKey('artist-fixed-count'));
  await reveal(tester,fixed);expect(tester.widget<SwitchListTile>(fixed).value,true);
  expect(find.widgetWithText(TextField,'每组画师人数'),findsOneWidget);
  await capture(tester,'issues8283-fixed-${size.width.toInt()}');
  await tester.tap(fixed);await tester.pumpAndSettle();
  expect((await SharedPreferences.getInstance()).getBool('artist_lab_random_v1_fixedArtistCount'),false);
  // Expand the selected-style library and exercise the actual commit path.
  final library=find.byWidgetPredicate((w)=>w is ExpansionTile && w.key.toString().contains('random-artist-style-tag-library')).first;
  await reveal(tester,library);await tester.tap(find.descendant(of:library,matching:find.byType(ListTile)).first);await tester.pumpAndSettle();
  final minField=find.byKey(const PageStorageKey<String>('artist-text-minRandomCustomTags'));
  final maxField=find.byKey(const PageStorageKey<String>('artist-text-maxRandomCustomTags'));
  await reveal(tester,minField);expect(tester.widget<TextField>(minField).controller!.text,'0');
  await tester.enterText(minField,'5');await tester.enterText(maxField,'2');
  tester.widget<TextField>(maxField).onEditingComplete!();await tester.pumpAndSettle();
  final prefs=await SharedPreferences.getInstance();
  expect(prefs.getInt('artist_lab_random_v1_minRandomCustomTags'),2);
  expect(prefs.getInt('artist_lab_random_v1_maxRandomCustomTags'),5);
  await tester.pumpWidget(const SizedBox());await mount();
  await reveal(tester,fixed);expect(tester.widget<SwitchListTile>(fixed).value,false);
  expect(prefs.getString('artist_lab_random_v1_poolSource'),'local');
  expect(tester.takeException(),isNull);
 });
 }
 test('fixed artists per recipe does not change the batch count',() {
  final rows=drawArtistRecipes(pool:List.generate(20,(i)=>ArtistTagRecord(i+1,'fixture_$i',100)),count:9,minArtists:4,maxArtists:4,drawSeed:12);
  expect(rows.length,9);expect(rows.every((r)=>r.artists.length==4),true);
 });
}
