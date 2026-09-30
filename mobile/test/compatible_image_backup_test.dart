import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/services/compatible_image_backup.dart';

class BackupPaths extends PathProviderPlatform {
 final String root; BackupPaths(this.root);
 @override Future<String?> getApplicationDocumentsPath() async => root;
 @override Future<String?> getTemporaryPath() async => root;
}
class FailableStorage extends Storage {
 bool fail=false,failAfter=false;
 @override Future<void> setSettings(AppSettings value) async {
  if(fail)throw StateError('fixture persistence failure');
  await super.setSettings(value);
  if(failAfter)throw StateError('fixture uncertain commit');
 }
}
class HookBackup extends DataBackupService {
 final Future<void> Function() hook; HookBackup(super.storage,this.hook);
 @override Future<File> createBackup(Set<DataBackupCategory> requested,{bool includeAssets=true,String prefix='manual',bool internal=false}) async {
  final file=await super.createBackup(requested,includeAssets:includeAssets,prefix:prefix,internal:internal);
  if(prefix=='before-import')await hook();return file;
 }
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 late Directory root; late FailableStorage storage; late DataBackupService service;
 final config=<String,dynamic>{'baseUrl':'https://images.example.test/v1','model':'existing-model','size':'auto','responseFormat':'auto','extensions':<String,dynamic>{}};
 setUp(() async {
  root=Directory.systemTemp.createTempSync('image-backup-'); PathProviderPlatform.instance=BackupPaths(root.path);
  UnifiedStorage.active=null;SharedPreferences.setMockInitialValues({});FlutterSecureStorage.setMockInitialValues({});
  storage=FailableStorage();service=DataBackupService(storage);
  await storage.setSettings(AppSettings(imageOutputDir:root.path));
  await storage.saveCompatibleConfiguration(AppSettings(imageProvider:'openai-images',compatibleImage:config),'fixture-existing-key');
 });
 tearDown((){if(root.existsSync()&&root.parent.path==Directory.systemTemp.path&&root.path.split(Platform.pathSeparator).last.startsWith('image-backup-'))root.deleteSync(recursive:true);});
 Future<File> archive(Map<String,dynamic> api) async {
  final zip=Archive();
  void json(String name,Object data){final bytes=utf8.encode(jsonEncode(data));zip.addFile(ArchiveFile(name,bytes.length,bytes));}
  json('manifest.json',{'format':DataBackupService.format,'version':1,'categories':[{'category':'apiCredentials','items':3,'bytes':0}]});
  json('data/api-credentials.json',{'settings':api});
  return File('${root.path}/input.naisbackup').writeAsBytes(ZipEncoder().encode(zip)!);
 }
 Future<Map<String,dynamic>> exported(File file) async {
  final zip=ZipDecoder().decodeBytes(await file.readAsBytes());
  return (jsonDecode(utf8.decode(zip.findFile('data/api-credentials.json')!.content as List<int>)) as Map)['settings'] as Map<String,dynamic>;
 }
 test('restores the explicit empty key without retaining the old image endpoint/key',() async {
  final input=await archive({'imageProvider':'openai-images','compatibleImage':{...config,'model':'restored-cleared'},'imageApiKey':''});
  await service.importBackup(input.path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true);
  final state=await storage.readCompatibleApiState();
  expect(state['config']['model'],'restored-cleared');expect(state['config']['enabled'],false);expect(state['secret'],'');
 });
 test('portable API export omits device-specific credential pointers',() async {
  final input=await service.createBackup({DataBackupCategory.apiCredentials},includeAssets:false);
  final api=await exported(input);
  expect((api['compatibleImage'] as Map).containsKey('credentialId'),false);expect(api['imageApiKey'],'fixture-existing-key');
 });
 test('explicit key clearing removes obsolete versions and never stores the key in preferences',() async {
  await storage.saveCompatibleConfiguration(AppSettings(imageProvider:'openai-images',compatibleImage:config),'fixture-second-key');
  final input=await archive({'imageProvider':'openai-images','compatibleImage':config,'imageApiKey':''});
  await service.importBackup(input.path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true);
  expect((await const FlutterSecureStorage().readAll()).keys.where((k)=>k.startsWith('compatible_image_key_')),isEmpty);
  expect((await SharedPreferences.getInstance()).getString('app_settings'),isNot(contains('fixture-second-key')));
 });
 test('restore strips foreign credentialId and creates an independent local version',() async {
  final old=await storage.readCompatibleApiState();
  final input=await archive({'imageProvider':'openai-images','compatibleImage':{...config,'credentialId':old['binding']},'imageApiKey':'imported-private-key'});
  await service.importBackup(input.path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true);
  final next=await storage.readCompatibleApiState();expect(next['binding'],isNot(old['binding']));expect(next['secret'],'imported-private-key');
 });
 test('never-configured and disabled profiles restore with empty or retained independent keys',() async {
  for(final api in [
   {'imageProvider':'novelai','compatibleImage':<String,dynamic>{},'imageApiKey':''},
   {'imageProvider':'novelai','compatibleImage':config,'imageApiKey':'inactive-key'},
   {'imageProvider':'novelai','compatibleImage':{...config,'model':''},'imageApiKey':''},
  ]){
   await service.importBackup((await archive(api)).path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true);
   final exportedApi=await exported(await service.createBackup({DataBackupCategory.apiCredentials},includeAssets:false));
   expect(exportImageSettings(exportedApi),readImageSettingsBackup(api));
  }
 });
 test('old API archive without image profile retains current endpoint and private key',() async {
  final before=await storage.readCompatibleApiState();
  await service.importBackup((await archive({'visionApiModel':'legacy'})).path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true);
  expect(await storage.readCompatibleApiState(),before);
 });
 test('incomplete tuples and malformed values fail preflight without changing stored settings',() async {
  final before=await storage.readCompatibleApiState();
  for(final api in [
   {'imageProvider':'openai-images','compatibleImage':config}, {'imageApiKey':'new'},
   {'imageProvider':'openai-images','compatibleImage':config,'imageApiKey':42},
   for(final patch in [{'baseUrl':'https://user:pass@host/v1'},{'size':'bad'},{'responseFormat':'bad'},{'extensions':{'Authorization':'private'}},{'model':12}])
    {'imageProvider':'openai-images','compatibleImage':{...config,...patch},'imageApiKey':'private-fixture'},
  ]){
   final file=await archive(api);
   await expectLater(service.importBackup(file.path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true),throwsA(isA<FormatException>()));
   expect(await storage.readCompatibleApiState(),before);
  }
 });
 test('missing overwrite confirmation makes no changes',() async {
  final before=await storage.readCompatibleApiState();final file=await archive({'imageProvider':'novelai','compatibleImage':config,'imageApiKey':''});
  await expectLater(service.importBackup(file.path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:false),throwsStateError);
  expect(await storage.readCompatibleApiState(),before);
 });
 test('Agent changes during rescue backup abort image restore instead of replacing newer configuration',() async {
  final input=await archive({'imageProvider':'openai-images','compatibleImage':config,'imageApiKey':'incoming'});
  final hooked=HookBackup(storage,()async{await storage.saveCompatibleConfiguration(AppSettings(imageProvider:'openai-images',compatibleImage:{...config,'model':'agent-new'}),'agent-new-key');});
  await expectLater(hooked.importBackup(input.path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true),throwsStateError);
  final state=await storage.readCompatibleApiState();expect(state['secret'],'agent-new-key');expect(state['config']['model'],'agent-new');
 });
 test('failed pointer persistence keeps old config/key and removes only the uncommitted version',() async {
  final before=await storage.readCompatibleApiState();storage.fail=true;
  await expectLater(storage.restoreCompatibleImageBackup(await storage.getSettings(),{'imageProvider':'openai-images','compatibleImage':{...config,'model':'new'},'imageApiKey':'new-key'},before),throwsStateError);
  expect(await storage.readCompatibleApiState(),before);
  expect((await const FlutterSecureStorage().readAll()).values.where((v)=>v=='new-key'),isEmpty);
 });
 test('uncertain commit never deletes a key referenced by the persisted configuration',() async {
  final before=await storage.readCompatibleApiState();storage.failAfter=true;
  await expectLater(storage.restoreCompatibleImageBackup(await storage.getSettings(),{'imageProvider':'openai-images','compatibleImage':{...config,'model':'new'},'imageApiKey':'new-key'},before),throwsStateError);
  final state=await storage.readCompatibleApiState();expect(state['secret'],'new-key');expect(state['config']['model'],'new');
 });
 test('public API imports actual desktop ZIPs and emits Android archives for reverse import',() async {
  final directory=Platform.environment['STUDIO_IMAGE_BACKUP_INTEROP'];if(directory==null)return;
  for(final name in ['configured','cleared','disabled','empty']){
   final source=File('$directory/desktop-$name.naisbackup');expect(await source.exists(),true);
   final expected=readImageSettingsBackup(await exported(source));
   await service.importBackup(source.path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true);
   final output=await service.createBackup({DataBackupCategory.apiCredentials},includeAssets:false);
   expect(exportImageSettings(await exported(output)),{...expected!,'imageProvider':'novelai'});
   await output.copy('$directory/mobile-$name.naisbackup');
  }
 });

 test('an unavailable desktop key is not imported as an explicit clear',() async {
  final before=await storage.readCompatibleApiState();
  final file=await archive({'imageProvider':'openai-images','compatibleImage':config,'imageApiKey':'','imageCredentialState':'unavailable'});
  await expectLater(service.importBackup(file.path,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:true),throwsA(isA<FormatException>()));
  expect(await storage.readCompatibleApiState(),before);
 });

}

