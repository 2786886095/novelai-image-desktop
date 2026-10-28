// Native acceptance assertion only. No identity fields are dropped or coerced.
// NSDictionary/MethodChannel iteration order is not installed Bundle identity.
const nativeIosBundleStatusKeys = <String>{
  'state', 'downloadSupported', 'installSupported', 'bundleIdentifier',
  'currentVersion', 'currentBuild', 'appDisplayName', 'documentsVisible',
  'openDocumentsInPlace',
};
bool nativeIosBundleSnapshotsEqual(
    Map<String, dynamic> before, Map<String, dynamic> after) {
  if (before.length != nativeIosBundleStatusKeys.length ||
      after.length != nativeIosBundleStatusKeys.length) return false;
  return nativeIosBundleStatusKeys.every((key) =>
      before.containsKey(key) && after.containsKey(key) &&
      before[key] == after[key]);
}
