// Guards against an imported comic/batch project JSON causing OOM or a
// boot-loop crash (P1-13): items still carry their image as inline base64,
// and there is otherwise no upper bound on how many of those a crafted or
// corrupted project file could contain. These caps are intentionally
// generous for real usage — a personal batch/comic project — while still
// rejecting the pathological case before it gets persisted to
// SharedPreferences and re-loaded (and re-crashed on) every launch.
const int kMaxImportedProjectItems = 300;
const int kMaxImportedItemBase64Bytes = 15 * 1024 * 1024; // ~15MB base64 per image
const int kMaxImportedProjectBase64Bytes = 300 * 1024 * 1024; // ~300MB base64 total

class ImportTooLargeException implements Exception {
  final String message;
  const ImportTooLargeException(this.message);
  @override
  String toString() => message;
}

/// Throws [ImportTooLargeException] if the imported project's item count or
/// combined/individual base64 payload sizes exceed sane bounds. Call this
/// AFTER parsing but BEFORE committing the result to app state / storage.
void enforceImportLimits(List<String> base64Items, {required String itemNoun}) {
  if (base64Items.length > kMaxImportedProjectItems) {
    throw ImportTooLargeException(
      '导入的项目包含 ${base64Items.length} 个$itemNoun，超过上限 $kMaxImportedProjectItems 个，已拒绝导入。',
    );
  }
  var total = 0;
  for (final b64 in base64Items) {
    if (b64.length > kMaxImportedItemBase64Bytes) {
      throw const ImportTooLargeException(
        '导入的项目中有一张图片数据过大（超过 ${kMaxImportedItemBase64Bytes ~/ (1024 * 1024)}MB），已拒绝导入。',
      );
    }
    total += b64.length;
    if (total > kMaxImportedProjectBase64Bytes) {
      throw const ImportTooLargeException(
        '导入的项目图片总大小超过上限（${kMaxImportedProjectBase64Bytes ~/ (1024 * 1024)}MB），已拒绝导入。',
      );
    }
  }
}
