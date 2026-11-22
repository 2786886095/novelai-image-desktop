// Android-only device regression. Stage the authentic downloads as .part in
// files/resources/autocomplete on a dedicated test installation before launch.
// This goes through the same install, integrity checks and search as Settings.
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:novelai_mobile/services/resource_database_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!Platform.isAndroid) throw UnsupportedError('Android only');
  final s = ResourceDatabaseService.shared;
  final support = await getApplicationSupportDirectory();
  final receipt = <String, dynamic>{};
  void check(bool ok, String message) {
    if (!ok) throw StateError(message);
  }

  try {
    final old = await s.overview();
    final oldRelated = old.resources
        .singleWhere((x) => x.definition.id == ResourceDatabaseId.cooccurrence);
    if (!oldRelated.installed) {
      await s.install(ResourceDatabaseId.cooccurrence);
    }
    receipt['relatedAlreadyInstalledAtLaunch'] = oldRelated.installed;
    final relatedFile = File('${old.dataDirectory}/cooccurrence-v2.db');
    Future<String> hash() async =>
        (await sha256.bind(relatedFile.openRead()).single).toString();
    receipt['relatedShaBefore'] = await hash();
    Future<List<String>> related() async {
      s.clearMemoryCache();
      final tags = await s.relatedTags(['twintails'], limit: 5);
      check(tags.isNotEmpty && tags.every((x) => x.count > 0),
          'No on-disk co-occurrence results');
      return tags.map((x) => '${x.tag}:${x.count}').toList();
    }

    receipt['relatedBefore'] = await related();
    await s.install(ResourceDatabaseId.tagCatalog);
    for (final x in (await s.overview()).resources) {
      check(x.valid && x.installed && x.count == x.definition.expectedTags,
          '${x.definition.label}: ${x.message}, count=${x.count}');
      receipt[x.definition.id.name] = {'count': x.count, 'version': x.version};
    }
    final searches = <String, List<String>>{};
    for (final sample in {
      'twintails': 'twintails',
      'blue eyes': 'blue_eyes',
      'looking_at_view': 'looking_at_viewer',
      'kitten': 'young',
    }.entries) {
      final rows = await s.searchTagCatalog(sample.key, limit: 5);
      searches[sample.key] = rows.map((x) => x.tag).toList();
      check(searches[sample.key]!.contains(sample.value),
          'Unexpected search: ${sample.key} -> ${searches[sample.key]}');
    }
    receipt['searches'] = searches;
    receipt['relatedAfter'] = await related();
    receipt['relatedShaAfter'] = await hash();
    check(
        receipt['relatedShaBefore'] == receipt['relatedShaAfter'] &&
            jsonEncode(receipt['relatedBefore']) ==
                jsonEncode(receipt['relatedAfter']),
        'Previously installed recommendations changed');
    receipt['passed'] = true;
  } catch (e, st) {
    receipt.addAll(
        {'passed': false, 'error': e.toString(), 'stack': st.toString()});
  }
  await File('${support.path}/tag-database-probe.json')
      .writeAsString(jsonEncode(receipt), flush: true);
}
