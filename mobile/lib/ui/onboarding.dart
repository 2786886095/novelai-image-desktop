import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../state/app_state.dart';

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
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final pages = <Widget>[
      _buildPage(
        Icons.auto_awesome,
        t('onboarding.welcomeTitle'),
        t('onboarding.welcomeBody'),
      ),
      _buildPage(
        Icons.vpn_key_outlined,
        t('onboarding.networkTitle'),
        t('onboarding.networkBody'),
      ),
      _buildPage(
        Icons.key_outlined,
        t('onboarding.tokenTitle'),
        t('onboarding.tokenBody'),
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
        t('onboarding.capsuleTitle'),
        t('onboarding.capsuleBody'),
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
                child: Text(t('onboarding.skip')),
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
                      child: Text(t('onboarding.previous')),
                    ),
                  const Spacer(),
                  if (isLast)
                    FilledButton.icon(
                      onPressed: () => _finish(true),
                      icon: const Icon(Icons.key_outlined),
                      label: Text(t('onboarding.goSettingsToken')),
                    )
                  else
                    FilledButton(
                      onPressed: () => _controller.nextPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      ),
                      child: Text(t('onboarding.next')),
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
