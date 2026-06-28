import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/prompts/capsule_data.dart';

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
      final language = settingsLanguageTextFor(locale.code);
      final settings = settingsScreenTextFor(locale.code);
      final detail = settingsDetailTextFor(locale.code);
      final tokenGuide = tokenGuideTextFor(locale.code);
      final toolsHub = mobileToolsHubTextFor(locale.code);
      final generate = generateScreenTextFor(locale.code);
      for (final value in [
        language.sectionTitle,
        language.languageLabel,
        language.hint,
        tokenGuide.title,
        tokenGuide.close,
        tokenGuide.subtitle,
        tokenGuide.securityTitle,
        tokenGuide.securitySubtitle,
        tokenGuide.openNovelAi,
        toolsHub.title,
        toolsHub.comicTitle,
        toolsHub.comicSubtitle,
        toolsHub.batchTitle,
        toolsHub.batchSubtitle,
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
        appearance.tagAutocomplete,
        appearance.lockStyleTitle,
        appearance.lockStyleSubtitle,
        appearance.lockNegativeTitle,
        appearance.lockNegativeSubtitle,
        appearance.secureTitle,
        appearance.secureSubtitle,
        appearance.appInfoSubtitle,
        detail.tokenVerifiedSuccess,
        detail.connectionFailed,
        detail.networkSystemVpnTitle,
        detail.networkSystemVpnSubtitle,
        detail.networkTesting,
        detail.networkTest,
        detail.allowCustomEndpointTitle,
        detail.allowCustomEndpointSubtitle,
        detail.verifying,
        detail.verifyAndSaveToken,
        detail.howToGetToken,
        detail.clearToken,
        detail.visionApiUrl,
        detail.visionModel,
        detail.visionApiKey,
        detail.textApiUrl,
        detail.textModel,
        detail.textApiKey,
        detail.saveKey,
        detail.detectModel,
        detail.modelDetection,
        detail.noModelList,
        detail.tagRemoteTitle,
        detail.tagRemoteSubtitle,
        detail.tagLibraryTitle,
        detail.downloadedTagsPrefix,
        detail.downloadedTagsSuffix,
        detail.tagLibraryNotDownloaded,
        detail.downloadBusy,
        detail.download,
        detail.tagDataNotice,
        detail.tagMcpUrl,
        detail.serviceType,
        detail.mcpToolName,
        detail.tagServiceKey,
        detail.saveTagKey,
        detail.testTagMcp,
        detail.mcpCapsuleTitle,
        detail.mcpCapsuleSubtitle,
        detail.mcpConvertTitle,
        detail.mcpReverseTitle,
        detail.translateProvider,
        detail.googleTranslate,
        detail.baiduTranslate,
        detail.baiduAppId,
        detail.baiduSecret,
        detail.baiduSecretSaved,
        detail.saveBaiduSecret,
        detail.reverseTemplateTitle,
        detail.convertTemplateTitle,
        detail.comicTemplateTitle,
        detail.restoreTemplateNote,
        detail.promptShortcutEmpty,
        detail.delete,
        detail.newShortcut,
        detail.historyRetention,
        detail.days30,
        detail.days90,
        detail.oneYear,
        detail.longRetention,
        detail.daysSuffix,
        detail.imageNameTemplate,
        detail.imageNameVars,
        detail.keepMetadataTitle,
        detail.keepMetadataSubtitle,
        detail.saveToGalleryTitle,
        detail.saveToGallerySubtitle,
        detail.customized,
        detail.builtInTemplate,
        detail.resetDefault,
        detail.cancel,
        detail.save,
        detail.newShortcutTitle,
        detail.shortcutName,
        detail.shortcutPrefix,
        detail.shortcutSuffix,
        detail.shortcutNegative,
        detail.imageOutputPath,
        detail.defaultImageDir,
        detail.imagePathHint,
        detail.chooseFolder,
        detail.chooseImageFolderDialog,
        detail.restoreDefault,
        detail.fileAccessTitle,
        detail.fileAccessContent,
        detail.later,
        detail.authorize,
        generate.titleTextToImage,
        generate.titleImageLoaded,
        generate.notConfigured,
        generate.ready,
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
      expect(tokenGuide.steps, hasLength(3));
      for (final step in tokenGuide.steps) {
        expect(step.title.trim(), isNotEmpty);
        expect(step.description.trim(), isNotEmpty);
      }
    }
  });

  test('provides non-Chinese fallback labels for every capsule tag', () {
    final raw = jsonDecode(
      File('assets/capsule_taxonomy.json').readAsStringSync(),
    ) as List<dynamic>;
    final han = RegExp(r'[\u4E00-\u9FFF]');
    var count = 0;
    for (final category in raw.cast<Map<String, dynamic>>()) {
      for (final subgroup
          in (category['subgroups'] as List<dynamic>).cast<Map>()) {
        for (final tag in (subgroup['tags'] as List<dynamic>).cast<Map>()) {
          final en = tag['en'].toString();
          final zh = tag['zh'].toString();
          count += 1;
          expect(han.hasMatch(localizedTagLabel('en-US', en, sourceLabel: zh)),
              isFalse);
          if (han.hasMatch(zh)) {
            expect(localizedTagLabel('ja-JP', en, sourceLabel: zh).trim(),
                isNotEmpty);
            expect(localizedTagLabel('ko-KR', en, sourceLabel: zh),
                isNot(equals(zh)));
          }
        }
      }
    }
    expect(count, greaterThan(4000));
    expect(
        han.hasMatch(localizedCapsuleSubgroupName('en-US', '脸颊嘴部')), isFalse);
  });
}
