// ignore_for_file: avoid_print
// Real native storage/files/codecs/archive/font-engine and rendered library UI.
// This fixed entry does not certify OS picker dialogs or remote services.
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/models/style_library.dart';
import 'package:novelai_mobile/models/ui_typography.dart';
import 'package:novelai_mobile/models/builtin_ui_fonts.dart';
import 'package:novelai_mobile/prompts/negative_prompt_library.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/typography_settings.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/ui_fonts.dart';
import 'package:novelai_mobile/services/works_batch.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';
import 'native_scenario_support.dart';

final suite=NativeScenarios(33);
Future<void> main()=>suite.run(_run);
Future<void> _run() async {
  final c=await NativeContext.create('library'), app=c.app, storage=c.storage;
  final bytes=png(64,64), source=File('${c.root.path}/original.png');
  await source.writeAsBytes(bytes);
  try {
    // Settings: real native persistence, separately scoped HTTP clients and
    // invalid configuration validation. No system proxy is replaced.
    await app.setSettings((s){s.theme='dark';s.language='ja-JP';s.proxyForAi=false;
      s.proxyForNai=false;s.proxyForMcp=true;s.proxyForTranslate=false;});
    final reopened=await Storage().getSettings();
    require(reopened.theme=='dark'&&reopened.language=='ja-JP'&&!reopened.proxyForAi&&reopened.proxyForMcp,'Settings did not reopen');
    suite.check('settings','persist-and-reopen',{'nativePreferenceReopen':true,'language':reopened.language,'theme':reopened.theme});
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
    var requests=0;
    server.listen((r)async{require(r.connectionInfo!.remoteAddress.isLoopback,'External client');requests++;r.response.write('scope-ok');await r.response.close();});
    final scoped=AppSettings.fromJson(reopened.toJson())..proxyMode='custom'..proxyUrl='ftp://127.0.0.1:1';
    final clients=[createProxyHttpClient(scoped,scope:ProxyScope.ai),createProxyHttpClient(scoped,scope:ProxyScope.nai)];
    try {for(final client in clients){final response=await client.get(Uri.parse('http://127.0.0.1:${server.port}/scope'));require(response.body=='scope-ok','Direct scope failed');}}
    finally{for(final client in clients){client.close();}await server.close(force:true);}
    require(requests==2,'Independent scopes missing');
    await fails(()=>createProxyHttpClient(scoped,scope:ProxyScope.mcp),'Enabled invalid proxy was accepted');
    suite.check('settings','independent-service-proxy',{'realLoopbackRequests':requests,'disabledAiAndNaiBypassInvalidProxy':true,'enabledMcpRejectedInvalidScheme':true});
    final savedSettings=jsonEncode((await storage.getSettings()).toJson());
    await fails(()=>parseProxySettings(scoped),'Invalid proxy accepted');
    require(jsonEncode((await storage.getSettings()).toJson())==savedSettings,'Validation destroyed saved settings');
    suite.check('settings','invalid-change-no-destruction',{'savedSettingsUnchanged':true,'boundary':'production proxy parser; settings dialog not driven'},complete:false);

    await app.setSettings((s)=>s.language='en-US');
    await app.addStylePromptPresetGroup('Native Group');
    var style=await app.addStylePromptPreset(name:'Native style',prompt:r'1.2::artist:synthetic::, \(test\)',group:'Native Group');
    await app.renameStylePromptPreset(style.id,'Native renamed');
    await app.moveStylePromptPreset(style.id,'Moved Group');
    var saved=await Storage().getSettings();
    require(saved.stylePromptPresets.single.name=='Native renamed'&&saved.stylePromptPresets.single.group=='Moved Group','Style CRUD/reopen');
    final disposable=await app.addStylePromptPreset(name:'Disposable',prompt:'unused');await app.removeStylePromptPreset(disposable.id);
    require((await Storage().getSettings()).stylePromptPresets.length==1,'Style delete');
    suite.check('styles','crud-reopen',{'createdRenamedMovedReopenedDeleted':true,'remaining':1});
    final beforeNegative=app.params.negativePrompt,beforePositive=app.params.positivePrompt,beforeSeed=app.params.seed;
    app.applyStylePromptPreset(style);await app.updateStyleLibrary((_){});
    require(app.params.stylePrompt==style.prompt&&app.params.negativePrompt==beforeNegative&&app.params.positivePrompt==beforePositive&&app.params.seed==beforeSeed,'Style changed unselected fields');
    suite.check('styles','apply-selected-fields',{'onlyStylePromptChanged':true,'escapedPromptPreserved':true});
    style=app.settings.stylePromptPresets.firstWhere((p)=>p.id==style.id);
    final preview=await app.importStylePromptPreviewImages(preset:style,sources:[(path:source.path,name:'native.png')]);
    require(preview.length==1,'Style preview missing');
    final imported=parseStyleLines('\uFEFFOne\tfirst artist\nTwo\tsecond artist\n\n');
    await app.addStylePromptPresets([for(var i=0;i<imported.length;i++)StylePromptPreset(id:'native-import-$i',name:imported[i].name,prompt:imported[i].prompt,createdAt:'2026-10-16T00:00:00Z')]);
    final beforeStyleCount=app.settings.stylePromptPresets.length;
    await fails(()=>app.addStylePromptPreset(name:' ',prompt:'invalid'),'Empty style title accepted');
    require(app.settings.stylePromptPresets.length==beforeStyleCount&&parseStyleLines('\n\t\n').isEmpty,'Invalid style mutated library');
    require((await Storage().getSettings()).stylePromptPresets.any((s)=>s.previewImages.isNotEmpty),'Preview not persisted');
    suite.check('styles','preview-batch-import-invalid',{'previewNativeImageImported':true,'batchImported':2,'invalidNameNoMutation':true,'exportNotExposed':true});

    final negative={'id':'native-neg','name':'Native negative','prompt':r'bad hands, 1.3::text\(literal\)::','createdAt':'2026-10-16T00:00:00Z'};
    await app.mutateNegativePresets((s)=>[negative]);
    await app.mutateNegativePresets((s)=>[{...s.single,'name':'Renamed negative'}]);
    require((await Storage().getSettings()).negativePromptPresets.single['name']=='Renamed negative','Negative CRUD reopen');
    final exported=exportNegativeLibrary(app.settings.negativePromptPresets), parsed=parseNegativeLibrary(exported);
    await app.mutateNegativePresets((s)=>[]);
    await app.mutateNegativePresets((s)=>parsed);
    suite.check('negative-prompts','crud-and-reopen',{'nativeReopened':true,'exportImportEntries':parsed.length,'escapedBytesPreserved':parsed.single['prompt']==negative['prompt']});
    final positive=app.params.positivePrompt;
    app.setParam((p)=>p.negativePrompt=applyNegativePreset('old negative',negative['prompt']!,'append'));
    app.extras.charCaptions=[CharCaptionItem(prompt:'synthetic character',negativePrompt:'character uc',useCoords:true,x:.2,y:.8)];
    final payload=await c.api.buildPayload(syntheticToken,app.settings,app.params.copy()..model='nai-diffusion-4-5-full',42,app.extras);
    require(app.params.positivePrompt==positive&&payload['parameters']['uc'].contains(negative['prompt'])&&payload['parameters']['v4_negative_prompt']['caption']['char_captions'][0]['char_caption']=='character uc','Negative selected/character UC');
    suite.check('negative-prompts','selected-apply-and-character-uc',{'positiveUnchanged':true,'appendAndCharacterUcSerialized':true,'nativeParameterPersisted':(await storage.getParams()).negativePrompt==app.params.negativePrompt});
    final oldNegative=jsonEncode((await storage.getSettings()).negativePromptPresets);
    await fails(()=>parseNegativeLibrary('{"version":1,"presets":[]}'),'Bad negative identifier accepted');
    require(jsonEncode((await storage.getSettings()).negativePromptPresets)==oldNegative,'Invalid negative import destroyed data');
    suite.check('negative-prompts','invalid-no-destruction',{'malformedImportRejected':true,'nativeLibraryUnchanged':true});

    app.extras.vibeImages=[VibeTransferItem(base64:base64Encode(bytes),infoExtracted:.6,strength:.7)];
    require(await app.saveVibeReferencePreset(0,name:'Native Vibe',group:'Native References')==null,'Reference save failed');
    final ref=app.referencePresets.single, archive=await app.exportReferencePresets();
    final exportedArchive=ZipDecoder().decodeBytes(await archive.readAsBytes(),verify:true);
    require(exportedArchive.files.any((f)=>f.isFile&&f.size==bytes.length),'Reference original bytes absent');
    await app.deleteReferencePreset(ref.id);
    require(await app.importReferencePresets(archive.path)==null&&app.referencePresets.length==1,'Reference archive restore');
    require(digest(await File(app.referencePresets.single.filePath).readAsBytes())==digest(bytes),'Reference import changed original');
    suite.check('reference-presets','import-export-bytes',{'zipCrcVerified':true,'originalSha256':digest(bytes),'restoredCount':1});
    final importedRef=app.referencePresets.single;
    require(await app.addReferencePresetGroup('Reopened Group')==null,'Reference group create');
    await app.moveReferencePresetToGroup(importedRef.id,'Reopened Group');
    final library=await Storage().getReferencePresetLibrary();
    require(library.presets.single.group=='Reopened Group'&&library.groups.contains('Reopened Group'),'Reference group did not reopen');
    await app.deleteReferencePresetGroup('Reopened Group');
    require((await storage.getReferencePresetLibrary()).presets.single.group.isEmpty,'Reference group deletion orphaned item');
    suite.check('reference-presets','groups-edit-reopen',{'groupCreateMoveReopenDelete':true,'presetRetained':true});
    app.extras.vibeImages.clear();
    require(await app.applyReferencePreset(importedRef.id)==null,'Reference apply');
    require(app.extras.vibeImages.single.strength==.7&&app.extras.vibeImages.single.infoExtracted==.6,'Reference values lost');
    final refCount=app.referencePresets.length,extraCount=app.extras.vibeImages.length;
    require(await app.applyReferencePreset('nonexistent')!=null,'Missing reference accepted');
    final broken=File('${c.root.path}/invalid.zip');await broken.writeAsBytes([1,2,3]);
    require(await app.importReferencePresets(broken.path)!=null&&app.referencePresets.length==refCount&&app.extras.vibeImages.length==extraCount,'Invalid reference mutation');
    suite.check('reference-presets','apply-and-invalid',{'strength':.7,'informationExtracted':.6,'missingAndInvalidArchiveNoMutation':true});

    // Files use only a new application-owned synthetic managed directory.
    app.extras.vibeImages.clear();app.extras.charCaptions.clear();
    final first=await storage.saveImage(bytes,app.params,1),second=await storage.saveImage(bytes,app.params,2);
    app.history=await storage.getHistory();
    final favorites=MobileLocalFavorites(rootOverride:c.root), other=MobileLocalFavorites(rootOverride:c.root);
    try{
      final f=await favorites.add(first);final renamed=await favorites.rename(f.id,'日本語');
      require(digest(await (await favorites.file(renamed)).readAsBytes())==digest(bytes),'Favorite changed bytes');
      final copied=(await favorites.file(renamed)).path;
      await favorites.remove(f.id);
      require(await File(first.filePath).exists()&&await File(copied).exists(),'Favorite removal deleted source/copy');
      suite.check('favorites','copy-rename-remove-original',{'sha256':digest(bytes),'unicodeName':true,'sourceAndCopiedImageRetained':true});
      final known=await favorites.add(first);
      final legacy=HistoryItem.fromJson({...second.toJson(),'params':<String,dynamic>{}});
      final unknown=await favorites.add(legacy);
      for(final direction in ['asc','desc']){
        final sorted=await favorites.listSorted(sortBy:'generatedAt',sortDirection:direction);
        require(sorted.items.last.id==unknown.id&&sorted.items.first.id==known.id,'Unknown generated time not last');
        final bySaved=await favorites.listSorted(sortBy:'savedAt',sortDirection:direction);
        require(bySaved.items.map((e)=>e.id).toSet().length==2,'Saved time sort lost rows');
      }
      await favorites.saveView(sortBy:'generatedAt',sortDirection:'asc',pageSize:48);
      require((await other.list()).view.pageSize==48,'Favorite view not durable');
      suite.check('favorites','saved-generated-sort-unknown',{'orders':['savedAt/asc','savedAt/desc','generatedAt/asc','generatedAt/desc'],'unknownLast':true,'viewReopened':true});
      final stale=await other.list();await favorites.rename(known.id,'New revision');
      final fresh=await other.list();
      require(fresh.items.firstWhere((x)=>x.id==known.id).name=='New revision'&&stale.items.firstWhere((x)=>x.id==known.id).name!='New revision','Stale library did not refresh');
      await other.remove(known.id);
      await fails(()=>favorites.rename(known.id,'deleted stale'),'Deleted stale favorite was resurrected');
      require(await File(first.filePath).exists(),'Stale mutation deleted source');
      suite.check('favorites','reopen-stale-revision',{'secondInstanceObservedRename':true,'deletedStaleIdRejected':true,'sourcePreserved':true});
    }finally{favorites.dispose();other.dispose();}

    final backup=DataBackupService(storage);
    final exportedBackup=await backup.createBackup({DataBackupCategory.configuration,DataBackupCategory.imageHistory,DataBackupCategory.promptPresets},prefix:'native-scenarios');
    final inspection=await backup.inspect(exportedBackup.path);
    require(inspection.categories.any((x)=>x.category==DataBackupCategory.imageHistory),'Backup image category absent');
    ZipDecoder().decodeBytes(await exportedBackup.readAsBytes(),verify:true);
    suite.check('backup','archive-export-inspect',{'categories':inspection.categories.map((x)=>x.category.id).toList(),'zipCrcVerified':true,'nativeWorkerArchive':true});
    await storage.setToken(syntheticToken);await storage.writeHistory([]);
    final importedBackup=await backup.importBackup(exportedBackup.path,{DataBackupCategory.imageHistory},confirmConfigurationOverwrite:false);
    final count=(await Storage().getHistory()).length;
    await backup.importBackup(exportedBackup.path,{DataBackupCategory.imageHistory},confirmConfigurationOverwrite:false);
    require(count==2&&(await storage.getHistory()).length==count&&await storage.getToken()==syntheticToken,'Selective restore/dedupe failed');
    suite.check('backup','selective-restore-dedupe',{'restoredImages':count,'secondImportNoDuplicates':true,'unselectedCredentialPreserved':true});
    final beforeHistory=jsonEncode((await storage.getHistory()).map((x)=>x.toJson()).toList());
    final corrupt=File('${c.root.path}/corrupt-backup.zip');await corrupt.writeAsBytes([0x50,0x4b,0]);
    await fails(()=>backup.importBackup(corrupt.path,{DataBackupCategory.imageHistory},confirmConfigurationOverwrite:false),'Corrupt backup accepted');
    require(jsonEncode((await storage.getHistory()).map((x)=>x.toJson()).toList())==beforeHistory,'Corrupt backup mutated history');
    require(importedBackup.rescueBackupPath.isNotEmpty&&await File(importedBackup.rescueBackupPath).exists(),'Safety rescue backup missing');
    await fails(()=>backup.importBackup(exportedBackup.path,{DataBackupCategory.configuration},confirmConfigurationOverwrite:false),'Configuration overwrite lacked confirmation');
    suite.check('backup','corrupt-no-mutation-safety-rescue',{'corruptNoMutation':true,'rescueBackupExists':true,'configurationConfirmationEnforced':true});

    // Output filenames are unique even with identical user naming templates.
    await app.setSettings((s)=>s.imageNameTemplate='same-native-name');
    final a=await storage.saveImage(bytes,app.params,11),b=await storage.saveImage(png(64,64,90),app.params,12);
    require(a.filePath!=b.filePath&&digest(await File(a.filePath).readAsBytes())==digest(bytes),'Managed output clobbered existing image');
    suite.check('output-management','managed-write-no-clobber',{'uniquePaths':true,'firstBytesPreserved':true,'managedRootUsed':a.filePath.startsWith(c.root.path)});
    final chosen=await Directory('${c.root.path}/chosen-output').create();await app.setSettings((s)=>s.imageOutputDir=chosen.path);
    final chosenItem=await storage.saveImage(bytes,app.params,13);
    require(chosenItem.filePath.startsWith(chosen.path)&&(await Storage().getHistory()).any((h)=>h.id==chosenItem.id),'Output folder history link');
    suite.check('output-management','folder-choice-history-link',{'configuredFolderUsed':true,'historyPathMatched':true,'nativePickerDialogDriven':false},complete:false);
    final external=File('${c.root.path}/external-original.png');await external.writeAsBytes(bytes);
    final externalItem=HistoryItem.fromJson({...a.toJson(),'id':'external','filePath':external.path});
    final policy=WorksBatchFiles([chosen]);
    final outside=await policy.delete([externalItem],{'external'});
    require(outside.removedIds.contains('external')&&await external.exists()&&digest(await external.readAsBytes())==digest(bytes),'Outside original deleted');
    suite.check('output-management','invalid-outside-paths-no-delete',{'outsideRecordRemovedNotFile':true,'originalBytesPreserved':true});

    await app.setSettings((s)=>s.imageOutputDir=c.root.path);
    app.history=await storage.getHistory();await app.createGroup('Native group A');await app.createGroup('Native group B');
    final groupA=app.groups.first,groupB=app.groups.last;
    final ids=app.history.take(2).map((x)=>x.id).toSet();
    await app.moveHistoryItems(ids,groupA.id);await app.moveHistoryItems(ids,groupA.id);
    final grouped=await Storage().getHistory();
    require(grouped.where((x)=>ids.contains(x.id)).every((x)=>x.groupId==groupA.id)&&grouped.map((x)=>x.id).toSet().length==grouped.length,'Batch move duplicates');
    suite.check('works-batch-edit','move-multiple-dedupe',{'moved':ids.length,'duplicateMoveNoDuplicateRows':true});
    final shared=await storage.saveImage(bytes,app.params,20);
    final twin=HistoryItem.fromJson({...shared.toJson(),'id':'shared-twin'});
    await storage.writeHistory([shared,twin]);
    final one=await storage.deleteHistoryItems({shared.id});
    require(one.removedIds.contains(shared.id)&&await File(shared.filePath).exists(),'Selected delete broke unselected shared file');
    final two=await storage.deleteHistoryItems({twin.id});
    require(two.removedIds.contains(twin.id)&&!await File(shared.filePath).exists(),'Last shared file not deleted');
    suite.check('works-batch-edit','delete-selected-shared-files',{'firstDeletePreservesShared':true,'lastSelectedDeleteUnlinksOnce':true});
    final good=await storage.saveImage(bytes,app.params,21),directory=await Directory('${c.root.path}/not-file.png').create();
    final invalid=HistoryItem.fromJson({...good.toJson(),'id':'invalid-directory','filePath':directory.path});
    await storage.writeHistory([good,invalid]);
    final partial=await storage.deleteHistoryItems({good.id,invalid.id,'stale-id'});
    require(partial.removedIds.contains(good.id)&&partial.failedIds.contains(invalid.id)&&(await storage.getHistory()).single.id==invalid.id,'Partial delete lost failed row');
    final beforeMove=jsonEncode((await storage.getHistory()).map((x)=>x.toJson()).toList());
    await fails(()=>storage.moveHistoryItems({invalid.id},'missing-group'),'Stale group accepted');
    require(jsonEncode((await storage.getHistory()).map((x)=>x.toJson()).toList())==beforeMove,'Failed move mutated rows');
    suite.check('works-batch-edit','invalid-stale-partial-error',{'successful':1,'failedRetained':1,'staleGroupNoMutation':true,'unknownSelectedIdNoResurrection':true});

    final present=await storage.saveImage(bytes,app.params,30),missing=await storage.saveImage(bytes,app.params,31);
    await File(missing.filePath).delete();
    final removed=await storage.reconcileMissingHistory();
    require(removed.contains(missing.id)&&(await storage.getHistory()).any((h)=>h.id==present.id),'Missing reconciliation lost existing image');
    suite.check('missing-file-reconciliation','delete-confirmed-missing',{'confirmedMissingRemoved':true,'presentRecordPreserved':true,'directoryRecordNotPruned':(await storage.getHistory()).any((h)=>h.id==invalid.id)});
    app.history=await storage.getHistory();
    await app.renameHistory(present.id,'Rebound content');
    final rebound=(await Storage().getHistory()).firstWhere((h)=>h.id==present.id);
    require(rebound.filePath!=present.filePath&&await File(rebound.filePath).exists()&&digest(await File(rebound.filePath).readAsBytes())==digest(bytes),'Rename/rebind changed content');
    suite.check('missing-file-reconciliation','move-rebind-content',{'recordIdPreserved':true,'newPathExists':true,'contentSha256':digest(bytes)});
    final unavailable=Directory('${c.root.path}/unavailable-volume'),offlineItem=HistoryItem.fromJson({...present.toJson(),'id':'offline-root','filePath':'${unavailable.path}/nested/original.png'});
    final unavailablePolicy=WorksBatchFiles([unavailable]);
    require(!await unavailablePolicy.conclusivelyMissing(offlineItem.filePath),'Unavailable root incorrectly proved deletion');
    final offlineDelete=await unavailablePolicy.delete([offlineItem],{offlineItem.id});
    require(offlineDelete.failedIds.contains(offlineItem.id)&&offlineDelete.removedIds.isEmpty,'Offline root lost record');
    suite.check('missing-file-reconciliation','offline-root-keeps-record',{'conclusiveMissing':false,'failedIdsRetained':true});

    await storage.writeHistory([rebound,HistoryItem.fromJson({...rebound.toJson(),'id':'other-group','groupId':groupB.id})]);
    app.history=await storage.getHistory();app.settings.activeHistoryGroupId='';
    await mount(app,const GalleryScreen());
    GridView grid()=>elements((w)=>w is GridView).single.widget as GridView;
    require((grid().childrenDelegate as SliverChildBuilderDelegate).childCount==2,'Gallery all rows not rendered');
    final drops=elements((w)=>w is StudioDropdownButton<String>);
    (drops[1].widget as StudioDropdownButton<String>).onChanged!(groupB.id);await frame();
    require((grid().childrenDelegate as SliverChildBuilderDelegate).childCount==1,'Gallery actual group filter failed');
    await frame();
    require((await Storage().getSettings()).activeHistoryGroupId==groupB.id,'Gallery group selection not persisted');
    suite.check('works','filter-group-and-reopen',{'allCount':2,'selectedGroupCount':1,'realGalleryWidget':true,'groupSelectionNativePersisted':true});
    await mount(app,const Scaffold(body:Text('unmount gallery before file mutations')));
    final collision=File('${File(rebound.filePath).parent.path}/collision.png');await collision.writeAsBytes(png(64,64,200));
    app.history=await storage.getHistory();await app.renameHistory(rebound.id,'collision');
    final unique=app.history.firstWhere((h)=>h.id==rebound.id);
    require(unique.filePath!=collision.path&&digest(await File(unique.filePath).readAsBytes())==digest(bytes)&&digest(await collision.readAsBytes())==digest(png(64,64,200)),'Rename collision clobbered file');
    suite.check('works','rename-collision-bytes',{'collisionPreserved':true,'renamedBytesPreserved':true,'historyReopened':(await Storage().getHistory()).any((h)=>h.filePath==unique.filePath)});
    await fails(()=>app.renameHistory('missing-id','bad'),'Invalid history rename accepted');
    final invalidDelete=await storage.deleteHistoryItems({'missing-id'});
    require(invalidDelete.removedIds.isEmpty&&await File(unique.filePath).exists(),'Invalid delete changed unrelated file');
    suite.check('works','delete-safety-and-errors',{'missingRenameRejected':true,'staleDeleteNoMutation':true,'managedAndOutsideAndSharedSafetyExercised':true});

    // Font bytes come from bundled public assets, never the user's font folder.
    final fonts=['default','sans','serif','mono',...builtinUiFonts.map((f)=>f.id)];
    for(final font in fonts){await app.setUiTypography(UiTypography(font:font,scale:125));require((await Storage().getSettings()).uiTypography.font==font,'Font selection not durable');}
    final fontBytes=(await rootBundle.load('assets/ui-fonts/${builtinUiFonts.first.file}')).buffer.asUint8List();
    final importFile=File('${c.root.path}/synthetic-copy.ttf');await importFile.writeAsBytes(fontBytes);
    final repository=await uiFontRepository(),custom=await repository.importFile(importFile.path);
    await app.setUiTypography(UiTypography(font:custom.id,scale:150));
    require(uiFontLoaded(custom.id)&&digest(await repository.read(custom.id))==digest(fontBytes),'Font engine/import integrity');
    await app.setUiTypography(const UiTypography());await repository.remove(custom.id);
    suite.check('typography','all-font-controls',{'builtInAndGenericFonts':fonts.length,'importedEngineFontVerified':true,'removedAndReset':true,'nativePickerDriven':false});
    for(final language in ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){
      await app.setSettings((s)=>s.language=language);
      await mount(app,const Scaffold(body:SingleChildScrollView(padding:EdgeInsets.all(8),child:TypographySettings())));
      final samples=elements((w)=>w.key==const ValueKey('typography-current-sample'));
      require(samples.length==1&&(samples.single.widget as Text).data!.isNotEmpty,'Localized font sample missing');
    }
    require((await Storage().getSettings()).language=='ko-KR','Typography language did not reopen');
    suite.check('typography','localized-samples-reopen',{'renderedLanguages':5,'actualTypographyWidget':true,'savedLanguageReopened':true});
    await app.setUiTypography(UiTypography.fromJson({'font':'invalid-font','scale':900}));
    require(app.settings.uiTypography.font=='default'&&app.settings.uiTypography.scale==200,'Typography bound normalize');
    await mount(app,const Scaffold(body:SingleChildScrollView(padding:EdgeInsets.all(8),child:TypographySettings())));
    require(elements((w)=>w.key==const ValueKey('typography-scale')).length==1,'Scale control absent');
    suite.check('typography','bounds-layout',{'invalidFontFallback':'default','scaleClamped':200,'actualSettingsControlsRendered':true,'globalTextScaleLayoutNotDriven':true},complete:false);
    await mount(app,const Scaffold(body:Text('native library scenarios complete')));
    await storage.clearToken();
  } finally { await c.close(); }
}
