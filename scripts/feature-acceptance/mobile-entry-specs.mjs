// Independent host policy. Never infer expected counts from native DONE.
export const mobileNativeEntries=Object.freeze({
 core19:Object.freeze({testFile:'integration_test/native_feature_journeys.dart',expectedChecks:19,scenarioChecks:0}),
 metadata_favorites16:Object.freeze({testFile:'integration_test/native_metadata_favorites.dart',expectedChecks:16,scenarioChecks:0}),
 metadata_import3:Object.freeze({testFile:'integration_test/native_metadata_import_scenarios.dart',expectedChecks:3,scenarioChecks:3}),
 gallery3:Object.freeze({testFile:'integration_test/native_online_gallery_scenarios.dart',expectedChecks:3,scenarioChecks:3}),
 queue_lifecycle4:Object.freeze({testFile:'integration_test/native_queue_lifecycle.dart',expectedChecks:4,scenarioChecks:0}),
 release_parity7:Object.freeze({testFile:'integration_test/native_release_parity.dart',expectedChecks:7,scenarioChecks:4}),
 library33:Object.freeze({testFile:'integration_test/native_library_scenarios.dart',expectedChecks:33,scenarioChecks:30}),
 generation24:Object.freeze({testFile:'integration_test/native_generation_scenarios.dart',expectedChecks:24,scenarioChecks:23}),
 text15:Object.freeze({testFile:'integration_test/native_text_scenarios.dart',expectedChecks:15,scenarioChecks:15}),
 skill_reopen1:Object.freeze({testFile:'integration_test/native_skill_reopen.dart',expectedChecks:1,scenarioChecks:1,predecessor:'text15'}),
 batch_mcp7:Object.freeze({testFile:'integration_test/native_batch_mcp_scenarios.dart',expectedChecks:7,scenarioChecks:7}),
 comic_openai6:Object.freeze({testFile:'integration_test/native_comic_openai_scenarios.dart',expectedChecks:6,scenarioChecks:6}),
 image_agent3:Object.freeze({testFile:'integration_test/native_image_agent_scenarios.dart',expectedChecks:3,scenarioChecks:3}),
 tools3:Object.freeze({testFile:'integration_test/native_tools_scenarios.dart',expectedChecks:3,scenarioChecks:3}),
 ui9:Object.freeze({testFile:'integration_test/native_ui_scenarios.dart',expectedChecks:9,scenarioChecks:9}),
 os6:Object.freeze({testFile:'integration_test/native_os_scenarios.dart',expectedChecks:6,scenarioChecks:6}),
 android_update2:Object.freeze({testFile:'integration_test/native_android_update_scenarios.dart',expectedChecks:2,scenarioChecks:2,platforms:Object.freeze(['android'])}),
 ios_update2:Object.freeze({testFile:'integration_test/native_ios_update_scenarios.dart',expectedChecks:2,scenarioChecks:2,platforms:Object.freeze(['ios'])}),
 android_folder1:Object.freeze({testFile:'integration_test/native_android_output_folder_scenario.dart',expectedChecks:1,scenarioChecks:1,platforms:Object.freeze(['android'])}),
});
export const isMobileScenarioEntry=entry=>Object.hasOwn(mobileNativeEntries,entry)&&mobileNativeEntries[entry].scenarioChecks>0;

// Fixed shards only reduce independent CI wall time; every registered entry is
// still required. The cold reopen pair must share a disposable device in order.
export const mobileNativeEntryGroups=Object.freeze({
 core:Object.freeze(['core19','queue_lifecycle4']),
 metadata:Object.freeze(['metadata_favorites16','metadata_import3']),
 gallery:Object.freeze(['gallery3']),
 library:Object.freeze(['library33']),
 generation:Object.freeze(['generation24','release_parity7']),
 text:Object.freeze(['text15','skill_reopen1']),
 workflows:Object.freeze(['batch_mcp7','comic_openai6','image_agent3','tools3']),
 ui:Object.freeze(['ui9']),
 os:Object.freeze(['os6','android_update2','ios_update2','android_folder1']),
});
export function selectMobileNativeEntries(group='all',platform){
 if(platform!==undefined&&!['android','ios'].includes(platform))throw Error('Unknown native mobile platform');
 const supported=entry=>!platform||!mobileNativeEntries[entry].platforms||mobileNativeEntries[entry].platforms.includes(platform);
 if(group==='all')return Object.keys(mobileNativeEntries).filter(supported);
 if(!Object.hasOwn(mobileNativeEntryGroups,group))throw Error('Unknown independently registered mobile CI group');
 return mobileNativeEntryGroups[group].filter(supported);
}
