import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/services/aitag_service.dart';

void main() {
  test('AITag HTTP 404 search response is a valid empty result', () async {
    final service = AitagService(
      client: MockClient((_) async => http.Response('', 404)),
    );
    final result = await service.search(query: '__no_match__');
    expect(result.page, 1);
    expect(result.total, 0);
    expect(result.items, isEmpty);
    service.close();
  });

  test(
      'AITag native data client searches, loads detail, and reuses metadata parser',
      () async {
    http.Response jsonResponse(Object value) => http.Response.bytes(
          utf8.encode(jsonEncode(value)),
          200,
          headers: const {'content-type': 'application/json'},
        );
    final client = MockClient((request) async {
      if (request.url.path == '/api/config') {
        return jsonResponse({
          'asset_base_url': 'https://cdn.example/',
          'available_years': [2026, 2025],
          'available_months': ['2026-07', '2026-06'],
        });
      }
      if (request.url.path == '/api/ai_works_search') {
        expect(request.url.queryParameters['page_size'], '$aitagPageSize');
        expect(request.url.queryParameters['time_range'], 'q2026Q2');
        return jsonResponse({
          'page': 1,
          'total': 1,
          'items': [
            {
              'id': 9,
              'title': '测试作品',
              'tags': '["solo","blue_hair"]',
              'AI_type': 'SD',
              'image_count': 1,
            }
          ],
        });
      }
      if (request.url.path == '/api/rank/monthly/fixed') {
        expect(request.url.queryParameters['month'], '2026-06');
        expect(request.url.queryParameters.containsKey('time_range'), isFalse);
        return jsonResponse({'page': 1, 'total': 0, 'items': []});
      }
      if (request.url.path == '/api/work/9') {
        return jsonResponse({
          'work': {'id': 9, 'title': '测试作品', 'AI_type': 'SD'},
          'images': [
            {
              'id': 3,
              'author_id': '22',
              'image_type': 'SD',
              'file_name': 'work 0',
              'ai_json': jsonEncode({
                'parameters':
                    '1girl\nNegative prompt: lowres\nSteps: 28, Sampler: Euler a, CFG scale: 6, Seed: 12, Size: 832x1216',
              }),
            }
          ],
        });
      }
      return http.Response('not found', 404);
    });

    final service = AitagService(client: client);
    await service.loadConfig();
    expect(service.availableYears, [2026, 2025]);
    expect(service.availableMonths, ['2026-07', '2026-06']);
    final search =
        await service.search(query: 'blue hair', timeRange: 'q2026Q2');
    expect(search.items.single.title, '测试作品');
    expect(search.items.single.tags, ['solo', 'blue_hair']);
    await service.search(sort: 'monthly', timeRange: 'm2026-06');

    final detail = await service.work(9);
    expect(service.imageUrl(detail.images.single),
        'https://cdn.example/SD/22/work%200.webp');
    final report = inspectImageMetadata(
        aitagMetadataRecord(detail.images.single, detail.work.aiType));
    expect(report.kind, ImageMetadataKind.stableDiffusion);
    expect(report.imported.steps, 28);
    expect(report.imported.width, 832);
    service.close();
  });
}
