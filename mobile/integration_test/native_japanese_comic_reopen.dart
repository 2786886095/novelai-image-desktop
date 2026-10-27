// Cold entry: only reads a qualified predecessor's actual native files/prefs.
// This file never seeds the state it claims to reopen.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/comic/comic_prompt_composer.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'native_scenario_support.dart';

final suite = NativeScenarios(2);
Future<void> main() => suite.run(_run);
Future<void> _run() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.reload();
  final raw = prefs.getString('native_japanese_v3_checkpoint');
  require(raw != null, 'Warm predecessor checkpoint is missing');
  final checkpoint = Map<String, dynamic>.from(jsonDecode(raw!) as Map);
  require(
      checkpoint['sourceSha'] == sourceSha &&
          checkpoint['profileSha'] == profileSha,
      'Cold checkpoint source/profile mismatch');
  require(checkpoint['warmPid'] is int && checkpoint['warmPid'] != pid,
      'Cold entry is not a fresh native process');
  final storage = Storage(), app = AppState(storage: storage);
  app.settings = await storage.getSettings();
  app.params = await storage.getParams();
  final library = app.templateLibrary;
  try {
    await library.load();
    final selected = library.resolve('comic.jp-page');
    require(
        library.builtins.length == 8 &&
            selected.source == 'custom' &&
            selected.id == checkpoint['customId'] &&
            selected.sha256 == checkpoint['customSha'],
        'Cold template selection/body was not durable');
    require(app.settings.convertPromptTarget == 'comic',
        'Cold conversion target was not durable');
    final exported = jsonDecode(library.exportCustomJson()) as Map;
    require(
        (exported['templates'] as List).any((v) => v['body'] == selected.body),
        'Cold custom export lost body');
    suite.check('settings', 'template-library-cold-reopen-native', {
      'freshNativeProcess': true,
      'differentPidFromQualifiedWarm': true,
      'sameCommittedSourceAndProfile': true,
      'selectedCustomIdBodyReadFromNativeFile': true,
      'sixImageTwoComicBuiltins': true,
      'conversionTargetReadFromRealPreferences': true,
      'noColdSeeding': true
    });

    final japanese = app.japaneseComic;
    await japanese.load();
    final project = await storage.getJapaneseComicProject(app.params),
        draft = await storage.getComicPromptDraft('japanese'),
        convertDraft = await storage.getComicPromptDraft('convert');
    require(
        digest(utf8.encode(jsonEncode(project.toJson()))) ==
            checkpoint['projectSha'],
        'Cold Japanese project hash changed');
    require(
        draft != null && digest(utf8.encode(draft)) == checkpoint['draftSha'],
        'Cold Japanese composer draft hash changed');
    require(
        convertDraft != null &&
            digest(utf8.encode(convertDraft)) == checkpoint['convertDraftSha'],
        'Cold conversion comic draft hash changed');
    require(
        digest(utf8.encode(jsonEncode(
                (await storage.getComicProject(app.params)).toJson()))) ==
            checkpoint['originalTagSha'],
        'Cold original tag project changed');
    await mount(app, ComicScreen(controller: japanese));
    final deadline = DateTime.now().add(const Duration(seconds: 45));
    while (elements((w) => w is ComicPromptComposerView).length != 1 ||
        !(elements((w) => w is ComicPromptComposerView).single.widget
                as ComicPromptComposerView)
            .controller
            .loaded) {
      require(DateTime.now().isBefore(deadline),
          'Cold composer did not mount/load');
      await frame();
    }
    final composer = (elements((w) => w is ComicPromptComposerView)
            .single
            .widget as ComicPromptComposerView)
        .controller;
    require(
        composer.output == jsonDecode(draft!)['output'] &&
            composer.input == jsonDecode(draft)['input'],
        'Cold native UI did not display saved draft');
    require(japanese.project.panels.length == 1,
        'Cold imported page count changed');
    suite.check('comic', 'japanese-project-draft-cold-reopen-native', {
      'actualNativeComicScreenAndComposer': true,
      'freshProcessProjectHashExact': true,
      'toolAndConversionDraftHashesExact': true,
      'originalTagProjectHashExact': true,
      'actualNativeDraftDisplayed': true,
      'noColdSeedOrProviderRequests': true
    });
  } finally {
    await mount(
        app, const Scaffold(body: Text('Cold Japanese comic reopen complete')));
    app.dispose();
  }
}
