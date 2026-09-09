import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/services/online_gallery_service.dart';
import 'package:novelai_mobile/services/quicktag_ui.dart';

void main() {
  test('QuickTagCloud keeps its gallery adapter and separate source identity',
      () {
    expect(OnlineGallerySource.quicktag.label, 'QuickTagCloud');
    expect(OnlineGallerySource.quicktag.siteUrl,
        'https://novelai.quicktagcloud.com');
    final implementation =
        File('lib/services/prompt_codex_service.dart').readAsStringSync();
    expect(implementation, contains('https://nai4.top'));
    expect(implementation, isNot(contains('quicktagcloud.com')));
    final gallery =
        File('lib/screens/online_gallery_screen.dart').readAsStringSync();
    expect(gallery, isNot(contains('QuickTagCloud ·')));
  });
  test('five-language labels match desktop and do not add a main destination',
      () {
    final shared =
        jsonDecode(File('../shared/quicktag-ui.json').readAsStringSync())
            as Map;
    for (final locale in supportedAppLocales) {
      expect(quickTagUi(locale.code), shared[locale.code]);
      expect(mobileUiTextFor(locale.code, 'promptCodex.enabled'),
          contains('nai4.top'));
      expect(mainDestinationLabelsFor(locale.code), hasLength(13));
      expect(mainDestinationLabelsFor(locale.code),
          isNot(contains('QuickTagCloud')));
    }
    expect(quickTagUi('zh-CN')['catalog'], '全部资料库');
  });
}
