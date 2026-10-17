import 'package:path/path.dart' as p;
import 'ios_output_folder.dart';

/// Opaque process-local native identity; a grant is never proof of ownership.
class WorksFileDescription {
  final String path, root, state;
  final String? managedRoot, receipt;
  final bool created;
  const WorksFileDescription({required this.path, required this.root,
    required this.state, this.managedRoot, this.receipt, this.created = false});
  bool get regular => state == 'file';
  bool get missing => state == 'missing';
}
class WorksRenameCopy {
  final WorksFileDescription source, destination;
  const WorksRenameCopy(this.source, this.destination);
}
abstract class WorksBatchFileAccess {
  Future<WorksFileDescription> describe(String path, List<String> managedRoots);
  Future<WorksRenameCopy> copyForRename(WorksFileDescription source, String stem);
  Future<void> delete(WorksFileDescription file);
}

typedef WorksMutationInvoke = Future<Map<String, dynamic>?> Function(
  String method, Map<String, dynamic> arguments);

/// Production iOS always calls its native coordinator. An injected transport is
/// host protocol testing only; never a picker, permission or device receipt.
class IosWorksBatchFileAccess implements WorksBatchFileAccess {
  final WorksMutationInvoke _invoke;
  IosWorksBatchFileAccess({WorksMutationInvoke? invoke})
    : _invoke = invoke ?? IosOutputFolder.mutate;
  WorksFileDescription _description(Map<String, dynamic>? value,
      String path, List<String> managedRoots, {bool created = false}) {
    final root=value?['root'], managed=value?['managedRoot'];
    final state=value?['state'], receipt=value?['receipt'];
    if (value?['path'] != path || value?['coordinated'] != true ||
        value?['available'] != true || root is! String ||
        !IosOutputFolder.isWithin(root, path) ||
        !['file','missing','other'].contains(state) ||
        (managed != null && (managed is! String ||
          !managedRoots.contains(managed) || !IosOutputFolder.isWithin(managed,path))) ||
        (state=='file' && (receipt is! String ||
          !RegExp(r'^[a-f0-9-]{36}$').hasMatch(receipt))) ||
        (state!='file' && receipt!=null) || value?['created']!=created) {
      throw const FormatException('Invalid coordinated file identity receipt');
    }
    return WorksFileDescription(path:path,root:root,state:state as String,
      managedRoot:managed as String?,receipt:receipt as String?,created:created);
  }
  @override
  Future<WorksFileDescription> describe(String path,List<String> managedRoots) async {
    if (!IosOutputFolder.isFolderPath(path) || managedRoots.length>2 ||
        managedRoots.any((r)=>!IosOutputFolder.isFolderPath(r))) {
      throw const FormatException('Invalid managed image path');
    }
    return _description(await _invoke('describe',{'path':path,'managedRoots':managedRoots}),
      path,managedRoots);
  }
  @override
  Future<WorksRenameCopy> copyForRename(WorksFileDescription source,String stem) async {
    if(!source.regular || source.receipt==null || stem.isEmpty ||
       stem=='.'||stem=='..'||RegExp(r'[/\\\x00-\x1f]').hasMatch(stem)) {
      throw const FormatException('Invalid rename source or name');
    }
    final value=await _invoke('copyForRename',{'path':source.path,'receipt':source.receipt,'stem':stem});
    final destination=value?['destination'];
    if(value?['sourcePath']!=source.path || value?['sourceReceipt']!=source.receipt ||
       value?['createdExclusive']!=true || value?['coordinated']!=true ||
       destination is! Map || destination['path'] is! String) {
      throw const FormatException('Invalid coordinated rename result');
    }
    final next=destination['path'] as String;
    final extension=p.posix.extension(source.path);
    final name=p.posix.basename(next);
    if(next==source.path || p.posix.dirname(next)!=p.posix.dirname(source.path) ||
       !RegExp('^${RegExp.escape(stem)}(?:-[2-9][0-9]*|-[1-9][0-9]{1,})?${RegExp.escape(extension.isEmpty?'.png':extension)}\$').hasMatch(name)) {
      throw const FormatException('Rename left its source directory');
    }
    final dest=_description(Map<String,dynamic>.from(destination),next,
      [if(source.managedRoot!=null)source.managedRoot!],created:true);
    if(dest.root!=source.root || dest.managedRoot!=source.managedRoot || !dest.regular) {
      throw const FormatException('Rename changed its authorized identity root');
    }
    return WorksRenameCopy(source,dest);
  }
  @override
  Future<void> delete(WorksFileDescription file) async {
    if(!file.regular || file.receipt==null || (!file.created && file.managedRoot==null)) {
      throw const FormatException('Deletion requires an owned regular-file receipt');
    }
    final value=await _invoke('deleteFile',{'path':file.path,'receipt':file.receipt});
    if(value?['path']!=file.path || value?['receipt']!=file.receipt ||
       value?['coordinated']!=true || value?['identityVerified']!=true || value?['deleted']!=true) {
      throw const FormatException('Native deletion was not confirmed');
    }
  }
}
