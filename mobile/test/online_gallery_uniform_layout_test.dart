import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'online galleries use source-ratio masonry cards, previews and local downloads',
      () {
    final online =
        File('lib/screens/online_gallery_screen.dart').readAsStringSync();
    final aitag =
        File('lib/screens/aitag_gallery_screen.dart').readAsStringSync();
    final storage = File('lib/services/storage.dart').readAsStringSync();
    final location = File('lib/services/online_gallery_download_location.dart')
        .readAsStringSync();
    final settings =
        File('lib/screens/settings_screen.dart').readAsStringSync();

    expect(online, contains('fit: BoxFit.contain'));
    expect(online, contains('aspectRatio: ratio'));
    expect(online, contains('GalleryImageAspect('));
    expect(online, contains('fallback: aspectRatio'));
    expect(online, contains('maxHeight: constraints.maxHeight * .68'));
    expect(online, contains('class _MasonryGrid extends StatelessWidget'));
    expect(online, contains('crossAxisAlignment: CrossAxisAlignment.start'));
    expect(online, contains('item.cover.width / item.cover.height'));
    expect(online, isNot(contains('SliverGrid.builder')));
    expect(online, isNot(contains('constraints.maxHeight * .58')));
    expect(online, contains('onDoubleTap:'));
    expect(online, contains('showGalleryImagePreview'));
    expect(online, contains('initialIndex: currentIndex'));
    expect(online, contains('initialIndex: itemIndex'));
    expect(online, contains('downloadCurrent'));
    expect(online, contains('downloadSeries'));
    expect(online, isNot(contains('Share.shareXFiles')));
    expect(online, isNot(contains("package:share_plus/share_plus.dart")));

    expect(aitag, contains('fit: BoxFit.contain'));
    expect(aitag, contains('fit: BoxFit.fitWidth'));
    expect(aitag, contains('maxHeight: constraints.maxHeight * .68'));
    expect(aitag, contains('class _MasonryGrid extends StatelessWidget'));
    expect(aitag, contains('crossAxisAlignment: CrossAxisAlignment.start'));
    expect(aitag, isNot(contains('SliverGrid.builder')));
    expect(aitag, contains('scrollDirection: Axis.horizontal'));
    expect(aitag, contains('onDoubleTap:'));
    expect(aitag, contains('_showAitagPreview'));
    expect(aitag, contains('showGalleryImagePreview'));
    expect(aitag, contains('initialIndex: urls.indexOf(url)'));
    expect(aitag, contains('downloadCurrent'));
    expect(aitag, contains('downloadSeries'));

    expect(storage, contains('Future<File> saveOnlineGalleryImage('));
    expect(storage, contains("'Online Gallery'"));
    expect(storage, contains('settings.onlineGalleryDownloadDir.trim()'));
    expect(online, contains('ensureOnlineGalleryDownloadDirectory(state)'));
    expect(aitag, contains('ensureOnlineGalleryDownloadDirectory(state)'));
    expect(location, contains('FilePicker.platform.getDirectoryPath'));
    expect(location,
        contains('settings.onlineGalleryDownloadDir = picked.trim()'));
    expect(settings, contains('_GalleryDownloadDirSetting('));
  });
}
