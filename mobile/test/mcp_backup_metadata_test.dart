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
class _Paths extends PathProviderPlatform {
 final String root; _Paths(this.root);
 @override Future<String?> getApplicationDocumentsPath() async=>root;
 @override Future<String?> getTemporaryPath() async=>root;
}
const keys=['tagServerTool','tagServerRelatedTool','tagServerArtistTool'];
const saved=<String,dynamic>{'tagServerEnabled':true,'tagServerUrl':'http://127.0.0.1:6350/mcp','tagServerType':'http','tagServerTool':'search_tags','tagServerRelatedTool':'get_related_tags','tagServerArtistTool':'get_artist_recommendations'};
const local=<String,dynamic>{'tagServerTool':'local_search','tagServerRelatedTool':'local_related','tagServerArtistTool':'local_artist'};
Map<String,dynamic> slots(Map<String,dynamic> s)=>{for(final k in keys)k:s[k]??''};
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 late Directory root;late Storage storage;late DataBackupService service;
 setUp(()async{root=Directory.systemTemp.createTempSync('mcp-backup-metadata-');PathProviderPlatform.instance=_Paths(root.path);UnifiedStorage.active=null;SharedPreferences.setMockInitialValues({});FlutterSecureStorage.setMockInitialValues({});storage=Storage();service=DataBackupService(storage);await storage.setSettings(AppSettings(imageOutputDir:root.path));});
 tearDown((){if(root.existsSync()&&root.parent.path==Directory.systemTemp.path&&root.path.split(Platform.pathSeparator).last.startsWith('mcp-backup-metadata-'))root.deleteSync(recursive:true);});
 Future<void> seed(Map<String,dynamic> s)async{await storage.setSettings(AppSettings.fromJson({... (await storage.getSettings()).toJson(),...s}));}
 Future<Map<String,dynamic>> current()async=>(await storage.getSettings()).toJson();
 Future<String> archive(Map<String,dynamic> api,[Map<String,dynamic>? configuration])async{final zip=Archive();void json(String name,Object data){final bytes=utf8.encode(jsonEncode(data));zip.addFile(ArchiveFile(name,bytes.length,bytes));}json('manifest.json',{'format':DataBackupService.format,'version':1,'categories':[]});json('data/api-credentials.json',{'settings':api});if(configuration!=null)json('data/configuration.json',configuration);final file=File('${root.path}/input.naisbackup');await file.writeAsBytes(ZipEncoder().encode(zip)!);return file.path;}
 Future<Map<String,dynamic>> read(File file,String name)async{final z=ZipDecoder().decodeBytes(await file.readAsBytes());return Map<String,dynamic>.from(jsonDecode(utf8.decode(z.findFile(name)!.content as List<int>)) as Map);}
 Future<void> restore(String p,[Set<DataBackupCategory> categories=const {DataBackupCategory.apiCredentials}])async{await service.importBackup(p,categories,confirmConfigurationOverwrite:true);}
 test('MCP metadata 01 exports all three API tool slots',()async{await seed(saved);final f=await service.createBackup({DataBackupCategory.apiCredentials},includeAssets:false);expect(slots(Map<String,dynamic>.from((await read(f,'data/api-credentials.json'))['settings'] as Map)),slots(saved));});
 test('MCP metadata 02 configuration-only export excludes API routing slots',()async{await seed(saved);final f=await service.createBackup({DataBackupCategory.configuration},includeAssets:false);final conf=await read(f,'data/configuration.json');expect(keys.where(conf.containsKey),isEmpty);});
 test('MCP metadata 03 API-only import restores all three slots and endpoint',()async{await seed(local);await restore(await archive(saved));expect(slots(await current()),slots(saved));expect((await current())['tagServerUrl'],saved['tagServerUrl']);});
 test('MCP metadata 04 legacy API import preserves unspecified optional slots',()async{await seed(local);await restore(await archive({'tagServerTool':'legacy_search'}));expect(slots(await current()),{...slots(local),'tagServerTool':'legacy_search'});});
 test('MCP metadata 05 configuration-only import cannot overwrite API tool slots',()async{await seed(local);await restore(await archive({}, {'theme':'dark',...saved}),{DataBackupCategory.configuration});expect(slots(await current()),slots(local));expect((await current())['theme'],'dark');});
 test('MCP metadata 06 combined configuration and API import follows the API category',()async{await seed(local);await restore(await archive(saved,{'theme':'dark','tagServerTool':'config_search','tagServerRelatedTool':'config_related','tagServerArtistTool':'config_artist'}),{DataBackupCategory.configuration,DataBackupCategory.apiCredentials});expect(slots(await current()),slots(saved));});
 test('MCP metadata 07 explicit empty optional slots really clear the selections',()async{await seed(local);await restore(await archive({...saved,'tagServerRelatedTool':'','tagServerArtistTool':''}));expect(slots(await current()),{'tagServerTool':saved['tagServerTool'],'tagServerRelatedTool':'','tagServerArtistTool':''});});
 test('MCP metadata 08 rejected confirmation leaves stored settings unchanged',()async{await seed(local);final p=await archive(saved);final prefs=await SharedPreferences.getInstance();final before=prefs.getString('app_settings');await expectLater(service.importBackup(p,{DataBackupCategory.apiCredentials},confirmConfigurationOverwrite:false),throwsStateError);expect(prefs.getString('app_settings'),before);expect(slots(await current()),slots(local));});
}
