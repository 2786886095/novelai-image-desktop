import 'dart:convert';
import 'dart:io';
import 'dart:async';
import 'package:path/path.dart' as path;
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/file_actions.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';

void main() {
  test('file endpoint is not an exposed model tool', () {
    expect(agentReadTools.contains(AgentFileActions.tool), false);
    expect(agentMutatingTools.contains(AgentFileActions.tool), false);
    expect(agentToolSchemas().any((x) => x['function']['name'] == AgentFileActions.tool), false);
  });
  test('known local image can be opened; unknown, missing and non-image files cannot', () async {
    final dir = await Directory.systemTemp.createTemp('agent-image-action-');
    try {
      final image = await File('${dir.path}/image.png').writeAsBytes([1]);
      final other = await File('${dir.path}/other.png').writeAsBytes([2]);
      final secret = await File('${dir.path}/private.txt').writeAsString('fixture');
      final opened = <String>[];
      final service = AgentFileActions(historyPaths: () => [image.path, secret.path],
          open: (file) async { opened.add(file.path); });
      final caps = await service.execute({'action':'capabilities'});
      expect(jsonDecode(caps.output)['label'], '查看或分享图片');
      expect(opened, isEmpty);
      expect((await service.execute({'action':'reveal','filePath':image.path})).ok, true);
      for (final value in [other.path, secret.path, 'https://example.com/image.png', '../image.png']) {
        expect((await service.execute({'action':'reveal','filePath':value})).ok, false);
      }
      expect((await service.execute({'action':'reveal','filePath':image.path,'command':'ignored'})).ok,false);
      await image.delete();
      expect((await service.execute({'action':'reveal','filePath':image.path})).ok,false);
      expect(opened, [path.normalize(image.path)]);
    } finally { await dir.delete(recursive:true); }
  });
  test('parallel native opens are serialized; failed native operation is not reported as success', () async {
    final dir = await Directory.systemTemp.createTemp('agent-image-action-');
    try {
      final image = await File('${dir.path}/image.png').writeAsBytes([1]);
      final entered = Completer<void>(), release = Completer<void>(); var count = 0;
      final service = AgentFileActions(historyPaths:()=>[image.path],open:(_) async {
        count++; entered.complete(); await release.future; throw StateError('native fixture error');
      });
      final first = service.execute({'action':'reveal','filePath':image.path});
      await entered.future;
      expect((await service.execute({'action':'reveal','filePath':image.path})).ok,false);
      release.complete(); expect((await first).ok,false); expect(count,1);
    } finally { await dir.delete(recursive:true); }
  });
}
