import '../comic/comic_models.dart';
import '../comic/comic_asset_store.dart';
import '../state/app_state.dart';
import 'agent_models.dart';

/// Agent-only registration checks; all file work uses the same UI boundary.
class ComicAssets extends ComicAssetStore {
  ComicAssets({super.root, super.share});

  Future<ComicReferenceAsset> importReference(AppState app, String source,
      String id, List<AgentAttachment> attachments) async {
    String? filename;
    if (source == 'history') {
      filename = app.history.where((x) => x.id == id).firstOrNull?.filePath;
    }
    if (source == 'reference') {
      filename =
          app.referencePresets.where((x) => x.id == id).firstOrNull?.filePath;
    }
    if (source == 'attachment') {
      filename = attachments
          .where((x) => x.id == id && x.kind == 'image')
          .firstOrNull
          ?.filePath;
    }
    if (filename == null) throw StateError('本次会话或软件中没有登记此图片ID');
    return importImage(filename);
  }
}
