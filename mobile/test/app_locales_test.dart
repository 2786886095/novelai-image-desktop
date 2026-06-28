import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';

void main() {
  test(
      'supports Simplified, Traditional, English, Japanese, and Korean locales',
      () {
    expect(
      supportedAppLocales.map((locale) => locale.code).toList(),
      ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'],
    );
  });

  test('normalizes unknown language codes to Simplified Chinese', () {
    expect(normalizeAppLocaleCode('zh-TW'), 'zh-TW');
    expect(normalizeAppLocaleCode('fr-FR'), 'zh-CN');
    expect(normalizeAppLocaleCode(null), 'zh-CN');
  });

  test('provides complete navigation labels for every locale', () {
    for (final locale in supportedAppLocales) {
      expect(mainDestinationLabelsFor(locale.code), hasLength(10));
      for (final label in mainDestinationLabelsFor(locale.code)) {
        expect(label.trim(), isNotEmpty);
      }
      expect(shellTextFor(locale.code).moreLabel.trim(), isNotEmpty);
      expect(shellTextFor(locale.code).allFeatures.trim(), isNotEmpty);
      final appearance = settingsAppearanceTextFor(locale.code);
      final settings = settingsScreenTextFor(locale.code);
      final generate = generateScreenTextFor(locale.code);
      for (final value in [
        settings.title,
        settings.accountConfigured,
        settings.accountUnconfigured,
        settings.verified,
        settings.anlas,
        settings.unknown,
        settings.updateAvailable,
        settings.versionUpdate,
        settings.checkFailed,
        settings.currentVersion,
        settings.view,
        settings.checkUpdate,
        settings.networkSection,
        settings.novelAiSection,
        settings.reverseSection,
        settings.convertSection,
        settings.tagSection,
        settings.translateSection,
        settings.promptTemplatesSection,
        settings.promptShortcutsSection,
        settings.storageSection,
        appearance.sectionTitle,
        appearance.themeLabel,
        appearance.themeSystem,
        appearance.themeLight,
        appearance.themeDark,
        appearance.languageLabel,
        appearance.tagAutocomplete,
        appearance.lockStyleTitle,
        appearance.lockStyleSubtitle,
        appearance.lockNegativeTitle,
        appearance.lockNegativeSubtitle,
        appearance.secureTitle,
        appearance.secureSubtitle,
        appearance.appInfoSubtitle,
        generate.titleTextToImage,
        generate.titleImageLoaded,
        generate.notConfigured,
        generate.stylePrompt,
        generate.positivePrompt,
        generate.negativePrompt,
        generate.translateBusy,
        generate.translate,
        generate.undoTranslation,
        generate.normalize,
        generate.weight,
        generate.randomPreview,
        generate.relatedTag,
        generate.unlockPrompt,
        generate.lockPrompt,
        generate.promptShortcuts,
        generate.previewEmpty,
        generate.loadImage,
        generate.switchToTextToImage,
        generate.tagSearchLabel,
        generate.tagSearchHint,
        generate.browseCategories,
        generate.downloadBusy,
        generate.downloadChineseTags,
        generate.tagsReadyPrefix,
        generate.tagsReadySuffix,
        generate.offlineTagHint,
        generate.capsuleLoadFailed,
        generate.inspirationCapsules,
        generate.model,
        generate.animeMode,
        generate.furryMode,
        generate.width,
        generate.height,
        generate.sampler,
        generate.noiseSchedule,
        generate.ucPreset,
        generate.randomSeed,
        generate.fixedSeed,
        generate.fixedSeedTooltip,
        generate.batch,
        generate.qualityToggle,
        generate.variety,
        generate.i2iParams,
        generate.strength,
        generate.noise,
        generate.extraNoiseSeed,
        generate.output,
        generate.imagePrefix,
        generate.historyGroup,
        generate.ungrouped,
        generate.quoting,
        generate.addToQueue,
        generate.waiting,
        generate.resume,
        generate.pause,
        generate.cancelAndClear,
        generate.generateImage,
        generate.generateCountPrefix,
        generate.generateCountSuffix,
        generate.useCurrentImage,
        generate.officialQuote,
        generate.formulaQuote,
        generate.pendingQuote,
        generate.precharge,
        generate.reading,
        generate.configureToken,
        generate.balance,
        generate.unknown,
        generate.queue,
        generate.running,
        generate.queued,
        generate.clearPending,
        generate.expandQueue,
        generate.collapseQueue,
        generate.pauseAfterCurrent,
        generate.runningCurrent,
        generate.batchPendingPrefix,
        generate.batchPendingSuffix,
        generate.removeFromQueue,
      ]) {
        expect(value.trim(), isNotEmpty);
      }
    }
  });
}
