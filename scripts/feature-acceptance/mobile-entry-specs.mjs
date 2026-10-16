// Independent host policy. Never infer expected counts from native DONE.
export const mobileNativeEntries=Object.freeze({
 core19:Object.freeze({testFile:'integration_test/native_feature_journeys.dart',expectedChecks:19,scenarioChecks:0}),
 metadata_favorites16:Object.freeze({testFile:'integration_test/native_metadata_favorites.dart',expectedChecks:16,scenarioChecks:0}),
 queue_lifecycle4:Object.freeze({testFile:'integration_test/native_queue_lifecycle.dart',expectedChecks:4,scenarioChecks:0}),
 release_parity7:Object.freeze({testFile:'integration_test/native_release_parity.dart',expectedChecks:7,scenarioChecks:4}),
 library33:Object.freeze({testFile:'integration_test/native_library_scenarios.dart',expectedChecks:33,scenarioChecks:30}),
 generation24:Object.freeze({testFile:'integration_test/native_generation_scenarios.dart',expectedChecks:24,scenarioChecks:23}),
});
export const isMobileScenarioEntry=entry=>Object.hasOwn(mobileNativeEntries,entry)&&mobileNativeEntries[entry].scenarioChecks>0;
