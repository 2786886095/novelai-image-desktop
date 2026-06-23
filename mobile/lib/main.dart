import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

import 'models/nai_models.dart';
import 'screens/gallery_screen.dart';
import 'screens/ai_log_screen.dart';
import 'screens/generate_screen.dart';
import 'screens/inspect_screen.dart';
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
  FlutterForegroundTask.initCommunicationPort();
  BackgroundQueueService.initialize();
  runApp(ChangeNotifierProvider(
      create: (_) => AppState()..load(), child: const NovelAIApp()));
}

class NovelAIApp extends StatelessWidget {
  const NovelAIApp({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = context.select<AppState, String>((s) => s.settings.theme);
    return MaterialApp(
      title: appName,
      debugShowCheckedModeBanner: false,
      theme: StudioTheme.light(),
      darkTheme: StudioTheme.dark(),
      themeMode: switch (theme) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      },
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

  static const _destinations = [
    StudioDestination(
        label: '生成',
        icon: Icons.auto_awesome_outlined,
        selectedIcon: Icons.auto_awesome),
    StudioDestination(
        label: '重绘', icon: Icons.brush_outlined, selectedIcon: Icons.brush),
    StudioDestination(
        label: '超分',
        icon: Icons.open_in_full_outlined,
        selectedIcon: Icons.open_in_full),
    StudioDestination(
        label: '后期', icon: Icons.tune_outlined, selectedIcon: Icons.tune),
    StudioDestination(
        label: '反推',
        icon: Icons.visibility_outlined,
        selectedIcon: Icons.visibility),
    StudioDestination(
        label: '转换',
        icon: Icons.translate_outlined,
        selectedIcon: Icons.translate),
    StudioDestination(
        label: '工具', icon: Icons.widgets_outlined, selectedIcon: Icons.widgets),
    StudioDestination(
        label: '图库',
        icon: Icons.photo_library_outlined,
        selectedIcon: Icons.photo_library),
    StudioDestination(
        label: '记录',
        icon: Icons.receipt_long_outlined,
        selectedIcon: Icons.receipt_long),
    StudioDestination(
        label: '设置',
        icon: Icons.settings_outlined,
        selectedIcon: Icons.settings),
  ];

  static const _pages = [
    GenerateScreen(),
    ToolsScreen(kind: ToolPageKind.inpaint),
    ToolsScreen(kind: ToolPageKind.upscale),
    ToolsScreen(kind: ToolPageKind.postprocess),
    InspectScreen(kind: InspectPageKind.reverse),
    InspectScreen(kind: InspectPageKind.convert),
    ToolsHubScreen(),
    GalleryScreen(),
    AiLogScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final booted = context.select<AppState, bool>((s) => s.booted);
    if (!booted) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final needsOnboarding =
        context.select<AppState, bool>((s) => s.needsNetworkOnboarding);
    if (needsOnboarding && !_onboardingScheduled) {
      _onboardingScheduled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showNetworkOnboarding();
      });
    }
    return StudioAdaptiveShell(
      selectedIndex: _index,
      onDestinationSelected: (index) => setState(() => _index = index),
      destinations: _destinations,
      pages: _pages,
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
    if (openSettings == true && mounted) setState(() => _index = 9);
  }
}
