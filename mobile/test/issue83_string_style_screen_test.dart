import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/v5_artist_weight_repair_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
Future<void> reveal(WidgetTester tester, Finder target) async {
 final scroll=find.byType(Scrollable).first;
 await tester.scrollUntilVisible(target,260,scrollable:scroll);await tester.pumpAndSettle();
 await tester.ensureVisible(target);await tester.pumpAndSettle();
}
void main() {
 setUpAll(() async {
  await (FontLoader('Roboto')..addFont(rootBundle.load('assets/ui-fonts/LXGWWenKaiLite-Regular.ttf'))).load();
  await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
 });
 for(final size in [const Size(320,700),const Size(420,860),const Size(800,360)]) {
 testWidgets('actual string draw exposes, enables, saves and reopens library tag limits at $size',(tester) async {
  tester.view.devicePixelRatio=1;tester.view.physicalSize=size;addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({'v5_artist_draw_v1_artistInput':'artist:fixture',
   'v5_artist_draw_v1_styleTags':['watercolor'],'v5_artist_draw_v1_candidateCount':3});
  final app=AppState();addTearDown(app.dispose);
  Future<void> mount() async {
   await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(theme:StudioTheme.light(),home:
    RepaintBoundary(key:const ValueKey('capture'),child:V5ArtistWeightRepairScreen(onBack:(){},mode:V5ArtistToolMode.draw)))));
   await tester.pumpAndSettle();
  }
  Future<void> expand() async {
   final library=find.byWidgetPredicate((w)=>w is ExpansionTile&&w.title is Text&&(w.title as Text).data=='画风 Tag 库');
   await reveal(tester,library);await tester.tap(find.descendant(of:library,matching:find.byType(ListTile)).first);await tester.pumpAndSettle();
  }
  await mount();await expand();
  final minField=find.byKey(const ValueKey('artist-string-style-min')),maxField=find.byKey(const ValueKey('artist-string-style-max'));
  expect(tester.widget<TextField>(minField).enabled,false);
  final random=find.widgetWithText(ChoiceChip,'随机加入');await reveal(tester,random);await tester.tap(random);await tester.pumpAndSettle();
  expect(tester.widget<TextField>(minField).enabled,true);
  await reveal(tester,minField);await tester.enterText(minField,'0');
  await reveal(tester,maxField);await tester.enterText(maxField,'0');
  tester.widget<TextField>(maxField).onEditingComplete!();await tester.pumpAndSettle();
  final prefs=await SharedPreferences.getInstance();
  expect(prefs.getInt('v5_artist_draw_v1_minRandomStyleTags'),0);expect(prefs.getInt('v5_artist_draw_v1_maxRandomStyleTags'),0);
  expect(jsonDecode(prefs.getString('v5_artist_draw_v1_styleTagModes')!)['watercolor'],'random');
  final dir=Platform.environment['RESULT_SCREENSHOTS'];if(dir!=null) { await tester.runAsync(() async {
    final image=await tester.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('capture'))).toImage();
    final bytes=await image.toByteData(format:ui.ImageByteFormat.png);
    await Directory(dir).create(recursive:true);await File('$dir/issue83-string-tags-${size.width.toInt()}.png').writeAsBytes(bytes!.buffer.asUint8List());image.dispose();
  }); }
  await tester.pumpWidget(const SizedBox());await mount();await expand();
  expect(tester.widget<TextField>(minField).controller!.text,'0');expect(tester.widget<TextField>(maxField).controller!.text,'0');
  expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip,'随机加入')).selected,true);
  expect(find.text('每串随机抽取数量'),findsOneWidget);expect(tester.takeException(),isNull);
  // Only local reroll. No generation button or network endpoint is called.
  final redraw=find.text('重新抽权重');await reveal(tester,redraw);await tester.tap(redraw);await tester.pumpAndSettle();
  expect(find.textContaining('已抽取 3 串'),findsOneWidget);
  expect(tester.takeException(),isNull);
 });
 }
}
