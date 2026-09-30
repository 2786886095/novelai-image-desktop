import 'comic_models.dart';

/// Portable desktop/mobile schema: no local paths, output IDs or reference files.
Map<String, dynamic> portableComicProject(ComicProject p) {
  final clean =
      ComicProject.fromJson(p.toJson(), p.globalParams, trustOutputs: false);
  final data = clean.toJson(includeLocalReferences: false)
    ..remove('historyGroupId');
  data['panels'] = clean.panels
      .map((panel) => {
            ...panel.toJson(includeLocalReferences: false),
            'paramsOverride': {
              'enabled': panel.overrideParams,
              'params': panel.params.toJson()
            },
          }..remove('params'))
      .toList();
  return data;
}

/// Removing a reference detaches records only. Files remain available to the
/// durable backup, history, presets and other projects that may share them.
ComicProject withoutComicReference(ComicProject source, String id) {
  if (!source.preciseReferences.any((r) => r.id == id)) {
    throw StateError('漫画参考ID不存在');
  }
  final next = ComicProject.fromJson(source.toJson(), source.globalParams,
      trustOutputs: true);
  next.preciseReferences.removeWhere((r) => r.id == id);
  for (final panel in next.panels) {
    panel.preciseReferences.removeWhere((r) => r.referenceId == id);
  }
  return next;
}
