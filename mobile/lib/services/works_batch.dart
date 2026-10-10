import 'dart:io';
import 'package:path/path.dart' as p;
import '../models/nai_models.dart';

class WorksBatchResult {
  final Set<String> removedIds,failedIds;
  final List<String> removedPaths;
  WorksBatchResult(Set<String> removed,Set<String> failed,List<String> paths)
    :removedIds=Set.unmodifiable(removed),failedIds=Set.unmodifiable(failed),removedPaths=List.unmodifiable(paths);
}
/// Regular files inside accessible managed roots only. No arbitrary import is unlinked.
class WorksBatchFiles {
  final List<Directory> roots;
  WorksBatchFiles(this.roots);
  Future<bool> _managed(String path) async {
    final absolute=p.normalize(p.absolute(path));
    for(final root in roots) {
      final base=p.normalize(p.absolute(root.path));
      if(!p.isWithin(base,absolute))continue;
      if(await FileSystemEntity.type(base,followLinks:false)!=FileSystemEntityType.directory)continue;
      final realRoot=await root.resolveSymbolicLinks();
      final realFile=await File(path).resolveSymbolicLinks();
      // An OS alias above the declared root (iOS /var -> /private/var) is allowed.
      // A link inside the managed subtree must still change this exact expected path.
      final expected=p.join(realRoot,p.relative(absolute,from:base));
      if(p.isWithin(realRoot,realFile) && p.equals(realFile,expected))return true;
    }
    return false;
  }
  Future<bool> conclusivelyMissing(String path) async {
    if(path.isEmpty)return false;
    try {
      if(await FileSystemEntity.type(path,followLinks:false)!=FileSystemEntityType.notFound)return false;
      final absolute=p.normalize(p.absolute(path));
      for(final root in roots) {
        if(!p.isWithin(p.normalize(p.absolute(root.path)),absolute))continue;
        if(await FileSystemEntity.type(root.path,followLinks:false)!=FileSystemEntityType.directory)continue;
        // Listing the root and its existing descendants distinguishes deletion from unavailable storage.
        await root.list(followLinks:false).toList();
        var parent=File(path).parent;
        while(p.isWithin(p.absolute(root.path),p.absolute(parent.path))) {
          final type=await FileSystemEntity.type(parent.path,followLinks:false);
          if(type==FileSystemEntityType.link)return false;
          if(type==FileSystemEntityType.directory) {await parent.list(followLinks:false).toList();break;}
          if(type!=FileSystemEntityType.notFound)return false;
          parent=parent.parent;
        }
        return await FileSystemEntity.type(path,followLinks:false)==FileSystemEntityType.notFound;
      }
      // For an external imported image only an accessible, listable immediate parent proves deletion.
      final parent=File(path).parent;
      if(await FileSystemEntity.type(parent.path,followLinks:false)!=FileSystemEntityType.directory)return false;
      await parent.list(followLinks:false).toList();
      return await FileSystemEntity.type(path,followLinks:false)==FileSystemEntityType.notFound;
    } catch (_) {return false;}
  }
  Future<WorksBatchResult> delete(List<HistoryItem> history,Set<String> ids) async {
    final removed=<String>{},failed=<String>{},paths=<String>[];
    final selected=history.where((h)=>ids.contains(h.id)).toList();
    final unselectedPaths=history.where((h)=>!ids.contains(h.id)).map((h)=>p.normalize(p.absolute(h.filePath))).toSet();
    final succeededPaths=<String>{},failedPaths=<String>{};
    for(final item in selected) {
      final path=p.normalize(p.absolute(item.filePath));
      if(failedPaths.contains(path)){failed.add(item.id);continue;}
      try {
        if(!succeededPaths.contains(path)) {
          final type=await FileSystemEntity.type(path,followLinks:false);
          if(type==FileSystemEntityType.notFound) {
            if(!await conclusivelyMissing(path))throw const FileSystemException('Storage unavailable');
          } else if(type!=FileSystemEntityType.file) {
            throw const FileSystemException('Not a regular file');
          } else if(!unselectedPaths.contains(path) && await _managed(path)) {
            // Revalidate immediately before unlink; never follow a symlink.
            if(await FileSystemEntity.type(path,followLinks:false)!=FileSystemEntityType.file || !await _managed(path)) {
              throw const FileSystemException('File identity changed');
            }
            await File(path).delete();paths.add(path);
          }
          succeededPaths.add(path);
        }
        removed.add(item.id);
      } catch (_) {failed.add(item.id);failedPaths.add(path);}
    }
    return WorksBatchResult(removed,failed,paths);
  }
}
