import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/artist_identity_index.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test(
      'recognizes adjacent URLs, aliases, invalid profile paths and input limits',
      () {
    final result = parseArtistBatch(
        'https://www.pixiv.net/users/123https://x.com/FiXtUrEhttps://twitter.com/fixture\nhttps://example.test/artist');
    expect(result.profiles.map((profile) => profile.key),
        ['pixiv:123', 'x:fixture']);
    expect(result.invalid, 1);
    for (final value in [
      'https://x.com:443/fixture',
      'https://x.com@127.0.0.1/fixture',
      'https://www.pixiv.net/artworks/123',
      'https://x.com/search'
    ]) {
      expect(() => parseArtistBatch(value), throwsFormatException);
    }
    expect(
        () => parseArtistBatch(
            List.generate(13, (i) => 'https://x.com/u$i').join()),
        throwsFormatException);
  });
  test(
      'local identity persistence does not upgrade imported mappings to verified',
      () async {
    SharedPreferences.setMockInitialValues({});
    final index = ArtistIdentityIndex();
    final data = jsonEncode({
      'version': 1,
      'artists': [
        {
          'id': 24,
          'tag': 'fixture_artist',
          'urls': ['https://x.com/fixture'],
          'savedAt': 1720000000000,
          'source': 'danbooru'
        }
      ]
    });
    final imported = readArtistIndex(data, imported: true);
    expect(imported.single.source, 'import');
    await index.merge(readArtistIndex(data));
    await index.merge(imported);
    final restored = await ArtistIdentityIndex().load();
    expect(restored.single.source, 'danbooru');
    expect(
        artistIndexMatch(
            lookupProfile('https://twitter.com/fixture')!, restored.single),
        isTrue);
  });
  test('different model format uses the individually set weights', () {
    final tags = {'fixture_artist': 1.35, 'fixture_two': 1.0};
    expect(formatLookupPrompt(tags, v5: true),
        '1.35::artist:fixture_artist ::, 1::artist:fixture_two ::');
    expect(formatLookupPrompt(tags, v5: false),
        '1.35::fixture_artist ::, fixture_two');
  });
  test(
      'Danbooru transport verifies exact identity URLs and recent general previews',
      () async {
    final service = ArtistTagService(
        clientFactory: (_) => MockClient((req) async {
              expect(req.url.host, 'danbooru.donmai.us');
              expect(req.followRedirects, isFalse);
              if (req.url.path == '/artists.json') {
                expect(req.url.queryParameters['search[url_matches]'],
                    'https://twitter.com/fixture');
                return http.Response(
                    jsonEncode([
                      {
                        'id': 24,
                        'name': 'fixture_artist',
                        'urls': [
                          {'url': 'https://x.com/fixture'}
                        ]
                      },
                      {
                        'id': 25,
                        'name': 'wrong_artist',
                        'urls': [
                          {'url': 'https://x.com/fixture_other'}
                        ]
                      },
                    ]),
                    200);
              }
              expect(
                  req.url.queryParameters['tags'], 'fixture_artist rating:g');
              final post = {
                'id': 1,
                'rating': 'g',
                'created_at': '2024-01-02T00:00:00Z',
                'preview_file_url': 'https://cdn.donmai.us/sample/a.jpg'
              };
              return http.Response(
                  jsonEncode([
                    post,
                    {...post, 'id': 8},
                    {...post, 'id': 9, 'rating': 'e'},
                    {
                      ...post,
                      'id': 10,
                      'preview_file_url': 'https://example.test/a.jpg'
                    }
                  ]),
                  200);
            }));
    expect(
        (await service.lookup(AppSettings(), 'https://x.com/fixture'))
            .single
            .tag,
        'fixture_artist');
    expect(
        (await service.lookupRecentPreviews(AppSettings(), 'fixture_artist'))
            .map((item) => item.id),
        [8, 1]);
  });
}
