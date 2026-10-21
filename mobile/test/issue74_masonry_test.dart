import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/screens/local_favorites_screen.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

List<String> errors(WidgetTester tester) {
  final result=<String>[];Object? error;
  while((error=tester.takeException())!=null){result.add('$error');}
  return result;
}

void main(){
  testWidgets('issue74 real favorites screen: 130 mixed-ratio favorites, masonry and grid', (tester) async {
    tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(600,1100);
    SharedPreferences.setMockInitialValues({});
    final root=Directory.systemTemp.createTempSync('issue74-mobile-');
    UnifiedStorage.active=root;
    final saved=Directory('${root.path}/images/favorites')..createSync(recursive:true);
    final items=<LocalFavorite>[];
    for(var i=0;i<130;i++){
      final width=i.isEven?32:16,height=i.isEven?16:32;
      final bytes=img.encodePng(img.Image(width:width,height:height));
      final prefix='20261019_${width}x${height}_${i.toString().padLeft(3,'0')}';
      final item=LocalFavorite(id:'item-$i',sourceId:'source-$i',prefix:prefix,name:'',extension:'.png',fileName:'$prefix.png',sha256:sha256.convert(bytes).toString(),bytes:bytes.length,savedAt:DateTime.utc(2026,10,19,0,0,i).toIso8601String());
      items.add(item);File('${saved.path}/${item.fileName}').writeAsBytesSync(bytes);
    }
    final index=File('${root.path}/data/local-favorites.json');index.parent.createSync(recursive:true);
    index.writeAsStringSync(jsonEncode({'version':1,'directory':'','items':items.map((e)=>e.toJson()).toList(),'view':{'layout':'masonry','pageSize':12,'sortBy':'savedAt','sortDirection':'desc'}}));
    final indexBefore=sha256.convert(index.readAsBytesSync()).toString();
    final state=AppState();state.settings.language='zh-CN';
    addTearDown(()async{
      await tester.pumpWidget(const SizedBox.shrink());await tester.pumpAndSettle();
      tester.view.reset();UnifiedStorage.active=null;state.dispose();
      PaintingBinding.instance.imageCache..clear()..clearLiveImages();
      await tester.runAsync(()async{
        for(var attempt=0;root.existsSync();attempt++){
          try{root.deleteSync(recursive:true);}on FileSystemException{if(attempt>=9)rethrow;await Future<void>.delayed(const Duration(milliseconds:100));}
        }
      });
    });
    Future<void> io()async{await tester.runAsync(()async{await MobileLocalFavorites.instance.list();await Future<void>.delayed(const Duration(milliseconds:80));});await tester.pumpAndSettle();}
    await tester.runAsync(()async{
      await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(value:state,child:const MaterialApp(home:LocalFavoritesScreen())));
      final context=tester.element(find.byType(LocalFavoritesScreen));
      for(final item in items.reversed.take(6)){
        await precacheImage(ResizeImage(FileImage(File('${saved.path}/${item.fileName}')),width:440),context);
      }
      await Future<void>.delayed(const Duration(milliseconds:100));
    });await tester.pumpAndSettle();await io();
    final initialErrors=errors(tester);
    final initialCards=find.byType(Card).evaluate().length;
    final names={for(final item in items)item.fileName:item.id};
    final initialOrder=find.byType(Card).evaluate().map((element){
      final texts=find.descendant(of:find.byWidget(element.widget),matching:find.byType(Text)).evaluate().map((e)=>(e.widget as Text).data??'');
      return names[texts.firstWhere(names.containsKey)];
    }).toList();
    final orderedIds=items.reversed.take(initialCards).map((item)=>item.id).toList();
    final stableSortOrder=jsonEncode(initialOrder)==jsonEncode(orderedIds);
    final pageControl=find.text('1 / 11').evaluate().isNotEmpty;
    final pageSizeControl=find.byWidgetPredicate((w)=>w is StudioDropdownButton<int>).evaluate().isNotEmpty;
    final first=find.text(items[129].fileName),second=find.text(items[128].fileName),third=find.text(items[127].fileName);
    final firstRect=tester.getRect(first),secondRect=tester.getRect(second),thirdRect=tester.getRect(third);
    final cardRects=[first,second,third].map((f)=>tester.getRect(find.ancestor(of:f,matching:find.byType(Card)).first)).toList();
    final leftToRight=cardRects[0].left<cardRects[1].left&&cardRects[1].left<cardRects[2].left&&(cardRects[0].top-cardRects[1].top).abs()<1&&(cardRects[1].top-cardRects[2].top).abs()<1;
    final imageWidgets=find.byWidgetPredicate((w)=>w is Image&&(w.fit==BoxFit.fitWidth||w.fit==BoxFit.contain)).evaluate().map((e)=>e.widget as Image).toList();
    final ratioImages=imageWidgets.take(3).map((w){final rect=tester.getSize(find.byWidget(w));return [rect.width,rect.height,rect.height==0?-1:rect.width/rect.height];}).toList();
    final position=Scrollable.of(tester.element(find.text(items[129].fileName))).position;
    final extentBefore=position.maxScrollExtent;
    final seen=<String>{};
    void collect(){for(final item in items){if(find.text(item.fileName).evaluate().isNotEmpty)seen.add(item.id);}}
    collect();
    for(var n=0;n<100&&!seen.contains('item-0');n++){
      final old=position.pixels;position.jumpTo((old+550).clamp(0,position.maxScrollExtent));await tester.pumpAndSettle();await io();collect();
      if(position.pixels==old)break;
    }
    final lastReachable=find.text(items.first.fileName).evaluate().isNotEmpty;
    var previewTotal=0;
    if(lastReachable){
      final card=find.ancestor(of:find.text(items.first.fileName),matching:find.byType(Card)).first;
      await tester.ensureVisible(card);await tester.tap(find.descendant(of:card,matching:find.byType(InkWell)).first);await tester.pumpAndSettle();
      if(find.text('130 / 130').evaluate().isNotEmpty)previewTotal=130;
      await tester.tap(find.byTooltip('关闭'));await tester.pumpAndSettle();
    }
    final screenErrors=errors(tester);
    final indexUnchangedBeforeSwitch=sha256.convert(index.readAsBytesSync()).toString()==indexBefore;
    await tester.runAsync(()=>MobileLocalFavorites.instance.saveView(layout:'grid'));await io();
    final gridPages=find.text('1 / 11').evaluate().isNotEmpty;
    final gridSize=find.byWidgetPredicate((w)=>w is StudioDropdownButton<int>).evaluate().isNotEmpty;
    final persisted=(await tester.runAsync(()=>MobileLocalFavorites.instance.list()))!;
    final filesUnchanged=items.every((item)=>sha256.convert(File('${saved.path}/${item.fileName}').readAsBytesSync()).toString()==item.sha256);
    final output={'initialCards':initialCards,'initialOrder':initialOrder,'stableSortOrder':stableSortOrder,'masonryPageControl':pageControl,'masonryPageSizeControl':pageSizeControl,'initialCaptionX':[firstRect.left,secondRect.left,thirdRect.left],'initialCaptionY':[firstRect.top,secondRect.top,thirdRect.top],'leftToRight':leftToRight,'imageSizes':ratioImages,'extentBefore':extentBefore,'lastReachable':lastReachable,'seenItems':seen.length,'previewTotal':previewTotal,'gridPaginationRetained':gridPages,'gridPageSizeRetained':gridSize,'storedPageSize':persisted.view.pageSize,'indexUnchangedBeforeSwitch':indexUnchangedBeforeSwitch,'filesUnchanged':filesUnchanged,'errors':[...initialErrors,...screenErrors,...errors(tester)]};
    debugPrint('ISSUE74_MOBILE ${jsonEncode(output)}');
    expect(output['errors'],isEmpty);expect(pageControl,isFalse);expect(pageSizeControl,isFalse);
    expect(initialCards,lessThan(30));expect(leftToRight,isTrue);expect(lastReachable,isTrue);expect(seen.length,130);expect(previewTotal,130);
    expect(stableSortOrder,isTrue);
    expect(ratioImages.map((v)=>v[2]),[0.5,2.0,0.5]);
    expect(gridPages,isTrue);expect(gridSize,isTrue);expect(persisted.view.pageSize,12);expect(indexUnchangedBeforeSwitch,isTrue);expect(filesUnchanged,isTrue);
  });
}
