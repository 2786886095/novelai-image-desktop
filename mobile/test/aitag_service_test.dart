import 'dart:convert';
import 'dart:async';
import 'package:novelai_mobile/services/aitag_error.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/services/aitag_service.dart';

void main() {
  test('AITag protection failure is explicit and recovers on retry', () async {
    var calls = 0;
    final service = AitagService(client: MockClient((_) async {
      calls++;
      return calls == 1
          ? http.Response(
              '<html>Cloudflare: Sorry, you have been blocked</html>', 403)
          : http.Response('{"page":1,"total":1,"items":[{"id":7}]}', 200);
    }));
    await expectLater(
        service.search(),
        throwsA(
            isA<AitagFailure>().having((e) => e.code, 'code', 'BLOCKED_403')));
    expect(calls, 1);
    expect((await service.search()).items.single.id, 7);
    expect(calls, 2);
    service.close();
  });
  test('AITag HTML 404 and HTML 200 are not empty galleries', () async {
    for (final status in [404, 200]) {
      final service = AitagService(
          client: MockClient(
              (_) async => http.Response('<html>unavailable</html>', status)));
      await expectLater(
          service.search(),
          throwsA(isA<AitagFailure>().having((e) => e.code, 'code',
              status == 404 ? 'HTTP_404' : 'INVALID_RESPONSE')));
      service.close();
    }
  });
  test('AITag source context restores requests rejected without it', () async {
    final service = AitagService(client: MockClient((request) async {
      if (request.headers['referer'] != '$aitagSiteUrl/') {
        return http.Response(
            '<html>Cloudflare: you have been blocked</html>', 403);
      }
      return http.Response('{"page":1,"total":1,"items":[{"id":7}]}', 200);
    }));
    expect((await service.search()).items.single.id, 7);
    expect((await service.search(sort: 'monthly')).items.single.id, 7);
    service.close();
  });

  test('AITag timeout has a separate diagnosis', () async {
    final service = AitagService(
        client: MockClient((_) async => throw TimeoutException('expired')));
    await expectLater(service.search(),
        throwsA(isA<AitagFailure>().having((e) => e.code, 'code', 'TIMEOUT')));
    service.close();
  });
  test('AITag errors are localized and do not expose server HTML', () {
    for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      final text =
          formatAitagFailure('AITAG_BLOCKED_403 <html>secret</html>', language);
      expect(text, contains('403'));
      expect(text, isNot(contains('secret')));
    }
    expect(formatAitagFailure(const AitagFailure('HTTP_429'), 'zh-CN'),
        contains('429'));
  });
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
      expect(request.headers['referer'], '$aitagSiteUrl/',
          reason:
              'AITag data endpoints reject requests without source context');
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
