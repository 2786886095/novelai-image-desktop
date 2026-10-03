import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
class _OwnedPaths extends PathProviderPlatform {
  final String root; _OwnedPaths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async=>root;
  @override Future<String?> getTemporaryPath() async=>root;
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('sensitive API category exports every saved account and active binding, not only active Token',()async{
  final root=Directory.systemTemp.createTempSync('owned-account-vault-export-');
  final originalPaths=PathProviderPlatform.instance;
  String? document;
  try{
   PathProviderPlatform.instance=_OwnedPaths(root.path);UnifiedStorage.active=null;SharedPreferences.setMockInitialValues({});FlutterSecureStorage.setMockInitialValues({});
   final accounts=NovelAiAccounts(read:()async=>document,write:(value)async=>document=value);
   await accounts.load(legacyToken:()async=>null,legacySettings:()async=>AppSettings());
   final storage=NovelAiAccountStorage(accounts);await storage.setSettings(AppSettings(imageOutputDir:root.path));
   await accounts.addVerified(label:'saved official',method:'token',token:'fixture-inactive-official',verify:(_)async=>const AccountSummary(hasToken:true,anlasBalance:23));
   await accounts.addVerified(label:'saved login',method:'official-login',token:'fixture-inactive-login',verify:(_)async=>const AccountSummary(hasToken:true,anlasBalance:31));
   final active=await accounts.addVerified(label:'selected relay',method:'relay',token:'fixture-relay-independent',apiBaseUrl:'https://relay.example.invalid/prefix',imageBaseUrl:'https://images.example.invalid/raw',verify:(_)async=>const AccountSummary(hasToken:true,anlasBalance:42));
   final before=document;
   final file=await DataBackupService(storage).createBackup({DataBackupCategory.apiCredentials},internal:true);
   final archive=ZipDecoder().decodeBytes(await file.readAsBytes());
   expect(archive.findFile('data/configuration.json'),isNull);
   final entry=archive.findFile('data/api-credentials.json');expect(entry,isNotNull);
   final api=jsonDecode(utf8.decode(entry!.content as List<int>)) as Map;
   final portable=api['novelAiAccounts'];
   // Guard the structure first so no assertion can dump an entire credential payload.
   expect(portable is Map,isTrue,reason:'API archive must include a portable saved account document');
   final vault=portable as Map;
   expect((vault['accounts'] as List).map((a)=>(a as Map)['label']).toList()..sort(),['saved login','saved official','selected relay']);
   expect(vault['selectedId'],active.id);
   expect(document,before,reason:'Export must not mutate active selection or account credentials');
  }finally{
   PathProviderPlatform.instance=originalPaths;
   if(root.parent.path!=Directory.systemTemp.path||!root.path.split(Platform.pathSeparator).last.startsWith('owned-account-vault-export-'))throw StateError('Unsafe owned fixture cleanup');
   await root.delete(recursive:true);
  }
 });
}
