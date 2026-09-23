import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/images/style_prompt_restore.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('metadata import restores the named preset without changing the effective prompt',(){
  SharedPreferences.setMockInitialValues({});
  final app=AppState();
  try {
    app.settings.stylePromptPresets=[StylePromptPreset(id:'saved',name:'Dream',prompt:'artist:a, artist:b',createdAt:'')];
    app.applyImportedMetadata(const ImportedGenerateParams(stylePrompt:'',positivePrompt:'artist:a, artist:b, 1girl'), exact:true,preserveMissing:true);
    expect(app.params.stylePrompt,'artist:a, artist:b');
    expect(app.params.positivePrompt,'1girl');
  } finally {app.dispose();}
 });
 test('exact longest saved style prefix',(){
  expect(restoreSavedStyle('artist:a, artist:b, 1girl',['artist:a','artist:a, artist:b']), (style:'artist:a, artist:b',positive:'1girl'));
 });
 test('unknown, middle matches and substring collisions stay intact',(){
  for(final prompt in ['artist:abc, 1girl','1girl, artist:a','unknown']) {expect(restoreSavedStyle(prompt,['artist:a']),isNull);}
 });
 test('style only',(){expect(restoreSavedStyle('artist:a',['artist:a']), (style:'artist:a',positive:''));});
}
