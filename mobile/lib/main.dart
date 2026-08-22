import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'i18n/app_locales.dart';
import 'models/nai_models.dart';
import 'screens/gallery_screen.dart';
import 'screens/ai_log_screen.dart';
import 'screens/generate_screen.dart';
import 'screens/inspect_screen.dart';
import 'screens/metadata_inspector_screen.dart';
import 'screens/tools_hub_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/tools_screen.dart';
import 'state/app_state.dart';
import 'services/background_queue_service.dart';
import 'ui/onboarding.dart';
import 'ui/studio_shell.dart';
import 'ui/studio_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (Platform.isAndroid) {
    FlutterForegroundTask.initCommunicationPort();
  }
  BackgroundQueueService.initialize();
  runApp(ChangeNotifierProvider(
      create: (_) => AppState()..load(), child: const NovelAIApp()));
}

class NovelAIApp extends StatelessWidget {
  const NovelAIApp({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = context.select<AppState, String>((s) => s.settings.theme);
    final language =
        context.select<AppState, String>((s) => s.settings.language);
    final localeInfo = appLocaleInfoFor(language);
    return MaterialApp(
      title: appName,
      debugShowCheckedModeBanner: false,
      locale: localeInfo.locale,
      supportedLocales: supportedAppLocales.map((locale) => locale.locale),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      theme: StudioTheme.light(),
      darkTheme: StudioTheme.dark(),
      themeMode: switch (theme) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      },
      builder: (context, child) => GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: child ?? const SizedBox.shrink(),
      ),
      home: const HomeShell(),
    );
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  bool _onboardingScheduled = false;
  bool _v5NoticeScheduled = false;
  late final List<Widget> _pages;

  static const _destinationIcons = [
    (icon: Icons.auto_awesome_outlined, selectedIcon: Icons.auto_awesome),
    (icon: Icons.brush_outlined, selectedIcon: Icons.brush),
    (icon: Icons.open_in_full_outlined, selectedIcon: Icons.open_in_full),
    (icon: Icons.tune_outlined, selectedIcon: Icons.tune),
    (icon: Icons.visibility_outlined, selectedIcon: Icons.visibility),
    (icon: Icons.translate_outlined, selectedIcon: Icons.translate),
    (icon: Icons.data_object_outlined, selectedIcon: Icons.data_object),
    (icon: Icons.widgets_outlined, selectedIcon: Icons.widgets),
    (
      icon: Icons.collections_bookmark_outlined,
      selectedIcon: Icons.collections_bookmark
    ),
    (icon: Icons.photo_library_outlined, selectedIcon: Icons.photo_library),
    (icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long),
    (icon: Icons.settings_outlined, selectedIcon: Icons.settings),
  ];

  @override
  void initState() {
    super.initState();
    _pages = [
      const GenerateScreen(),
      const ToolsScreen(kind: ToolPageKind.inpaint),
      const ToolsScreen(kind: ToolPageKind.upscale),
      const ToolsScreen(kind: ToolPageKind.postprocess),
      const InspectScreen(kind: InspectPageKind.reverse),
      const InspectScreen(kind: InspectPageKind.convert),
      MetadataInspectorScreen(
        onBack: () {
          if (mounted) setState(() => _index = 0);
        },
        onOpenGenerate: () {
          if (mounted) setState(() => _index = 0);
        },
      ),
      const ToolsHubScreen(),
      const Scaffold(
        body: SafeArea(
          child: ReferencePresetLibraryPanel(
            standalone: true,
            showClose: false,
          ),
        ),
      ),
      const GalleryScreen(),
      const AiLogScreen(),
      const SettingsScreen(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final booted = context.select<AppState, bool>((s) => s.booted);
    if (!booted) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final language =
        context.select<AppState, String>((s) => s.settings.language);
    final labels = mainDestinationLabelsFor(language);
    final shellText = shellTextFor(language);
    final destinations = [
      for (var i = 0; i < _destinationIcons.length; i++)
        StudioDestination(
          label: labels[i],
          icon: _destinationIcons[i].icon,
          selectedIcon: _destinationIcons[i].selectedIcon,
        ),
    ];
    final needsOnboarding =
        context.select<AppState, bool>((s) => s.needsNetworkOnboarding);
    if (needsOnboarding && !_onboardingScheduled) {
      _onboardingScheduled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showNetworkOnboarding();
      });
    }
    final currentModelIsV5 =
        context.select<AppState, bool>((s) => s.params.isV5);
    if (!needsOnboarding && !currentModelIsV5 && !_v5NoticeScheduled) {
      _v5NoticeScheduled = true;
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _showV5MigrationNotice());
    }
    return StudioAdaptiveShell(
      selectedIndex: _index,
      onDestinationSelected: (index) {
        FocusManager.instance.primaryFocus?.unfocus();
        setState(() => _index = index);
      },
      destinations: destinations,
      pages: _pages,
      moreLabel: shellText.moreLabel,
      allFeaturesLabel: shellText.allFeatures,
    );
  }

  Future<void> _showNetworkOnboarding() async {
    final openSettings = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      useSafeArea: false,
      builder: (_) => const Dialog.fullscreen(child: OnboardingFlow()),
    );
    if (!mounted) return;
    await context.read<AppState>().dismissNetworkOnboarding();
    if (openSettings == true && mounted) setState(() => _index = 11);
  }

  Future<void> _showV5MigrationNotice() async {
    const key = 'langbai.notice.v5-model-migration.v1';
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(key) == true || !mounted) return;
      final language = context.read<AppState>().settings.language;
      final copy = _v5MigrationCopy[language] ?? _v5MigrationCopy['zh-CN']!;
      final openGenerate = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          icon: const Icon(Icons.auto_awesome),
          title: Text(copy.title),
          content: Text(copy.body),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: Text(copy.keep)),
            FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: Text(copy.go)),
          ],
        ),
      );
      await prefs.setBool(key, true);
      if (openGenerate == true && mounted) setState(() => _index = 0);
    } catch (_) {
      // A preference backend may be unavailable in isolated widget tests.
    }
  }
}

typedef _V5MigrationCopy = ({
  String title,
  String body,
  String keep,
  String go
});

const Map<String, _V5MigrationCopy> _v5MigrationCopy = {
  'zh-CN': (
    title: 'NovelAI V5 Full 已上线',
    body:
        '为避免改变旧项目的复现结果，升级软件不会强制覆盖已经保存的模型。旧用户如仍显示 V4 / V4.5，请在生成页的模型列表中手动选择 NAI Diffusion V5 Full；新建默认配置已经使用 V5 Full。',
    keep: '保持当前模型',
    go: '前往模型选择'
  ),
  'zh-TW': (
    title: 'NovelAI V5 Full 已上線',
    body:
        '為避免改變舊專案的重現結果，升級軟體不會強制覆蓋已儲存的模型。舊使用者若仍顯示 V4 / V4.5，請在生成頁手動選擇 NAI Diffusion V5 Full；新建預設已使用 V5 Full。',
    keep: '保留目前模型',
    go: '前往模型選擇'
  ),
  'en-US': (
    title: 'NovelAI V5 Full is available',
    body:
        'Upgrades preserve the model saved in existing projects so their results remain reproducible. If an older installation still shows V4 or V4.5, choose NAI Diffusion V5 Full manually on Generate. New defaults already use V5 Full.',
    keep: 'Keep current model',
    go: 'Open model selector'
  ),
  'ja-JP': (
    title: 'NovelAI V5 Full が利用できます',
    body:
        '既存プロジェクトの再現性を守るため、更新時に保存済みモデルを強制変更しません。V4 / V4.5 のままの場合は、生成画面から NAI Diffusion V5 Full を手動で選択してください。新規既定値は V5 Full です。',
    keep: '現在のモデルを維持',
    go: 'モデル選択へ'
  ),
  'ko-KR': (
    title: 'NovelAI V5 Full을 사용할 수 있습니다',
    body:
        '기존 프로젝트의 재현 결과를 보호하기 위해 업데이트가 저장된 모델을 강제로 변경하지 않습니다. V4 / V4.5가 계속 표시되면 생성 화면에서 NAI Diffusion V5 Full을 직접 선택하세요. 새 기본값은 V5 Full입니다.',
    keep: '현재 모델 유지',
    go: '모델 선택으로 이동'
  ),
};
