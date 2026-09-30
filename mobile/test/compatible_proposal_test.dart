import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/compatible_proposal.dart';

void main() {
  final cases = jsonDecode(File('../shared/compatible-proposal-fixtures.json')
      .readAsStringSync()) as List;
  for (final c in cases) {
    test('compatible proposal: ${c['name']}', () {
      final p = TavernImageProposal.fromJson(
          Map<String, dynamic>.from(c['proposal']));
      final before = jsonEncode(p.toJson());
      if (c['error'] != null) {
        expect(() => compatibleProposalPrompt(p),
            throwsA(predicate((e) => '$e'.contains(c['error']))));
      } else {
        expect(compatibleProposalPrompt(p), c['expected']);
        expect(compatibleProposalPrompt(p), c['expected']);
      }
      expect(jsonEncode(p.toJson()), before);
    });
  }
}
