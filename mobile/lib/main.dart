import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'models/nai_models.dart';
import 'screens/gallery_screen.dart';
import 'screens/generate_screen.dart';
import 'screens/inspect_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/tools_screen.dart';
import 'state/app_state.dart';

void main() {
  runApp(ChangeNotifierProvider(create: (_) => AppState()..load(), child: const NovelAIApp()));
}

class NovelAIApp extends StatelessWidget {
  const NovelAIApp({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.select<AppState, bool>((s) => s.settings.darkMode);
    const seed = Color(0xFF7C5CFA);
    return MaterialApp(
      title: appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: seed)),
      darkTheme: ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark)),
      themeMode: dark ? ThemeMode.dark : ThemeMode.system,
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

  static const _pages = [
    GenerateScreen(),
    ToolsScreen(kind: ToolPageKind.inpaint),
    ToolsScreen(kind: ToolPageKind.upscale),
    ToolsScreen(kind: ToolPageKind.postprocess),
    InspectScreen(kind: InspectPageKind.reverse),
    InspectScreen(kind: InspectPageKind.convert),
    GalleryScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final booted = context.select<AppState, bool>((s) => s.booted);
    if (!booted) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return Scaffold(
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.auto_awesome), label: '生成'),
          NavigationDestination(icon: Icon(Icons.brush), label: '重绘'),
          NavigationDestination(icon: Icon(Icons.open_in_full), label: '超分'),
          NavigationDestination(icon: Icon(Icons.tune), label: '后期'),
          NavigationDestination(icon: Icon(Icons.visibility), label: '反推'),
          NavigationDestination(icon: Icon(Icons.translate), label: '转换'),
          NavigationDestination(icon: Icon(Icons.photo_library), label: '图库'),
          NavigationDestination(icon: Icon(Icons.settings), label: '设置'),
        ],
      ),
    );
  }
}
