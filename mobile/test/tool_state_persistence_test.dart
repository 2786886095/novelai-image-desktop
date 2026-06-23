import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/tags/offline_tag_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('last-used tool state persistence (desktop lastGenerationState parity)',
      () {
    test('boot restores reverse/convert mode and tool selections', () async {
      final storage = _MemoryStorage(
        AppSettings(
          reversePromptMode: 'mixed',
          convertPromptMode: 'mixed',
          inpaintModel: 'nai-diffusion-3-inpainting',
          inpaintStrength: 0.82,
          inpaintNoise: 0.3,
          upscaleScale: 4,
          directorTool: 'lineart',
          augmentDefry: 2,
          augmentColorizePrompt: 'soft lighting',
          augmentEmotion: 'angry',
          augmentEmotionLevel: 3,
        ),
      );
      final state = _TestState(
        api: NaiApi(),
        storage: storage,
        offlineTags: _OfflineTags(),
      );

      await state.load();

      expect(state.booted, isTrue);
      expect(state.reverseMode, ReversePromptMode.mixed);
      expect(state.convertMode, ReversePromptMode.mixed);
      expect(state.inpaintModel, 'nai-diffusion-3-inpainting');
      expect(state.inpaintStrength, closeTo(0.82, 1e-9));
      expect(state.inpaintNoise, closeTo(0.3, 1e-9));
      expect(state.upscaleScale, 4);
      expect(state.directorTool, 'lineart');
      expect(state.augmentOptions.defry, closeTo(2, 1e-9));
      expect(state.augmentOptions.colorizePrompt, 'soft lighting');
      expect(state.augmentOptions.emotion, 'angry');
      expect(state.augmentOptions.emotionLevel, closeTo(3, 1e-9));
    });

    test('persistToolState writes the current selections back to settings',
        () async {
      final storage = _MemoryStorage(AppSettings());
      final state = _TestState(
        api: NaiApi(),
        storage: storage,
        offlineTags: _OfflineTags(),
      );
      await state.load();

      state
        ..reverseMode = ReversePromptMode.natural
        ..convertMode = ReversePromptMode.tags
        ..inpaintModel = 'nai-diffusion-4-curated-inpainting'
        ..upscaleScale = 4
        ..directorTool = 'declutter'
        ..augmentOptions.emotion = 'sad';
      await state.persistToolState();

      final saved = storage.settings;
      expect(saved.reversePromptMode, 'natural');
      expect(saved.convertPromptMode, 'tags');
      expect(saved.inpaintModel, 'nai-diffusion-4-curated-inpainting');
      expect(saved.upscaleScale, 4);
      expect(saved.directorTool, 'declutter');
      expect(saved.augmentEmotion, 'sad');

      // A fresh boot from the same storage rehydrates the saved selections.
      final reopened = _TestState(
        api: NaiApi(),
        storage: storage,
        offlineTags: _OfflineTags(),
      );
      await reopened.load();
      expect(reopened.convertMode, ReversePromptMode.tags);
      expect(reopened.directorTool, 'declutter');
      expect(reopened.upscaleScale, 4);
    });
  });
}

class _TestState extends AppState {
  _TestState({
    required super.api,
    required super.storage,
    required super.offlineTags,
  });

  // Avoid the real GitHub update network call during boot.
  @override
  Future<void> checkUpdate({bool manual = false}) async {}
}

class _MemoryStorage extends Storage {
  AppSettings settings;
  _MemoryStorage(this.settings);

  @override
  Future<AppSettings> getSettings() async => settings;

  @override
  Future<void> setSettings(AppSettings value) async => settings = value;

  @override
  Future<GenerateParams> getParams() async => GenerateParams();

  @override
  Future<void> setParams(GenerateParams value) async {}

  @override
  Future<List<HistoryItem>> getHistory() async => [];

  @override
  Future<void> writeHistory(List<HistoryItem> items) async {}

  @override
  Future<List<HistoryGroup>> getGroups() async => [];

  @override
  Future<bool> hasSeenNetworkOnboarding() async => true;

  @override
  Future<String?> getToken() async => null;
}

class _OfflineTags extends OfflineTagStore {
  @override
  Future<OfflineTagStatus> status() async => const OfflineTagStatus();
}
