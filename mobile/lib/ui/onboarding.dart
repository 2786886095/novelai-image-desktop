import 'package:flutter/material.dart';

/// First-launch walkthrough, modelled on the desktop onboarding: intro → network
/// (system VPN) → API Token (reusing the three desktop token-guide images) →
/// capsule & tag library. Pops `true` when the user chooses to jump to Settings
/// to paste their Token, otherwise `false`.
class OnboardingFlow extends StatefulWidget {
  const OnboardingFlow({super.key});

  @override
  State<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends State<OnboardingFlow> {
  final _controller = PageController();
  int _page = 0;

  static const _tokenSteps = [
    'assets/token_guide/token-step-1.webp',
    'assets/token_guide/token-step-2.webp',
    'assets/token_guide/token-step-3.webp',
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _finish(bool openSettings) => Navigator.pop(context, openSettings);

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      _buildPage(
        Icons.auto_awesome,
        '欢迎使用 Langbai NovelAI Studio',
        '纯 API 调用的 NovelAI 创作工作台：文生图、图生图、局部重绘、超分、后期、'
            'AI 反推 / 转换、漫画与批量工具。Token 只保存在本机。',
      ),
      _buildPage(
        Icons.vpn_key_outlined,
        '先开启网络（梯子）',
        '移动端不内置代理。请在系统设置里开启 VPN / 全局代理后再使用——'
            'NovelAI、AI 反推 / 转换、翻译、标签库与更新检查都会走系统网络。',
      ),
      _buildPage(
        Icons.key_outlined,
        '获取并填入 API Token',
        '在 NovelAI 网页登录后：左上角菜单 → Account Settings → '
            'Get Persistent API Token，复制后粘贴到「设置 → NovelAI API」。',
        extra: [
          for (final step in _tokenSteps)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.asset(step, fit: BoxFit.contain),
              ),
            ),
        ],
      ),
      _buildPage(
        Icons.style_outlined,
        '灵感胶囊 & 标签补全',
        '已内置 4000+ 中文灵感胶囊，按 14 大类浏览，点选即插入英文标签。'
            '在生成页或设置里下载中文标签库后，输入中文或英文都能自动补全。',
      ),
    ];
    final isLast = _page == pages.length - 1;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => _finish(false),
                child: const Text('跳过'),
              ),
            ),
            Expanded(
              child: PageView(
                controller: _controller,
                onPageChanged: (index) => setState(() => _page = index),
                children: pages,
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var index = 0; index < pages.length; index++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: index == _page ? 18 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: index == _page
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  if (_page > 0)
                    TextButton(
                      onPressed: () => _controller.previousPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      ),
                      child: const Text('上一步'),
                    ),
                  const Spacer(),
                  if (isLast)
                    FilledButton.icon(
                      onPressed: () => _finish(true),
                      icon: const Icon(Icons.key_outlined),
                      label: const Text('去设置 Token'),
                    )
                  else
                    FilledButton(
                      onPressed: () => _controller.nextPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      ),
                      child: const Text('下一步'),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPage(
    IconData icon,
    String title,
    String body, {
    List<Widget> extra = const [],
  }) =>
      ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
        children: [
          const SizedBox(height: 12),
          Icon(icon, size: 64, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),
          Text(
            body,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          ...extra,
        ],
      );
}
