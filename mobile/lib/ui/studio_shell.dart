import 'package:flutter/material.dart';

import 'studio_theme.dart';

enum StudioWindowClass { phone, tablet, wideTablet }

abstract final class StudioBreakpoints {
  static const double tablet = 600;
  static const double wideTablet = 1180;

  static StudioWindowClass classify(Size size) {
    // A phone in landscape can easily be wider than 600dp, but its short side
    // is still phone-sized. Treating it as a tablet produced a cramped rail
    // layout with unreliable hit areas.
    if (size.shortestSide < tablet) return StudioWindowClass.phone;
    final width = size.width;
    if (width >= wideTablet) return StudioWindowClass.wideTablet;
    if (width >= tablet) return StudioWindowClass.tablet;
    return StudioWindowClass.phone;
  }
}

/// Constrains form-style content to a comfortable reading width on tablets so
/// fields don't stretch edge-to-edge; full width on phones.
class StudioContent extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  const StudioContent({super.key, required this.child, this.maxWidth = 760});

  @override
  Widget build(BuildContext context) {
    final phone = StudioBreakpoints.classify(MediaQuery.sizeOf(context)) ==
        StudioWindowClass.phone;
    if (phone) return child;
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth), child: child),
    );
  }
}

class StudioDestination {
  final String label;
  final IconData icon;
  final IconData selectedIcon;

  const StudioDestination({
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });
}

class StudioAdaptiveShell extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<StudioDestination> destinations;
  final List<Widget> pages;
  final String moreLabel;
  final String allFeaturesLabel;

  const StudioAdaptiveShell({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.destinations,
    required this.pages,
    this.moreLabel = 'More',
    this.allFeaturesLabel = 'All features',
  }) : assert(destinations.length == pages.length);

  // Reference presets are a first-class workflow on phones as well. Keep the
  // bottom bar to five destinations total (four primary pages + More) so labels
  // and hit targets remain usable on compact portrait and landscape devices.
  static const _phonePrimaryIndexes = [0, 1, 5, 7];

  @override
  Widget build(BuildContext context) {
    final windowClass = StudioBreakpoints.classify(MediaQuery.sizeOf(context));
    if (windowClass == StudioWindowClass.phone) {
      return _PhoneShell(
        selectedIndex: selectedIndex,
        onDestinationSelected: onDestinationSelected,
        destinations: destinations,
        pages: pages,
        moreLabel: moreLabel,
        allFeaturesLabel: allFeaturesLabel,
      );
    }
    return _TabletShell(
      selectedIndex: selectedIndex,
      onDestinationSelected: onDestinationSelected,
      destinations: destinations,
      pages: pages,
      extended: windowClass == StudioWindowClass.wideTablet,
    );
  }
}

/// Builds a destination only after its first visit and pauses animations while
/// it is hidden. A regular IndexedStack eagerly mounted all thirteen screens;
/// as gallery/tag/tool pages became richer this kept avoidable image caches,
/// controllers and tickers alive from the first frame.
class _LazyIndexedStack extends StatefulWidget {
  final int index;
  final List<Widget> children;

  const _LazyIndexedStack({required this.index, required this.children});

  @override
  State<_LazyIndexedStack> createState() => _LazyIndexedStackState();
}

class _LazyIndexedStackState extends State<_LazyIndexedStack> {
  final Set<int> _mountedIndexes = <int>{};

  @override
  void initState() {
    super.initState();
    _mountedIndexes.add(widget.index);
  }

  @override
  void didUpdateWidget(covariant _LazyIndexedStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    _mountedIndexes.removeWhere((index) => index >= widget.children.length);
    _mountedIndexes.add(widget.index);
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return Stack(
      fit: StackFit.expand,
      children: List<Widget>.generate(widget.children.length, (index) {
        final mounted = _mountedIndexes.contains(index);
        final active = index == widget.index;
        return Positioned.fill(
          key: ValueKey('studio-page-layer-$index'),
          child: IgnorePointer(
            ignoring: !active,
            child: ExcludeSemantics(
              excluding: !active,
              child: AnimatedOpacity(
                opacity: active ? 1 : 0,
                duration: reduceMotion ? Duration.zero : AppMotion.standard,
                curve: AppMotion.easeOut,
                child: TickerMode(
                  enabled: active,
                  child: mounted
                      ? widget.children[index]
                      : const SizedBox.shrink(),
                ),
              ),
            ),
          ),
        );
      }, growable: false),
    );
  }
}

class _PhoneShell extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<StudioDestination> destinations;
  final List<Widget> pages;
  final String moreLabel;
  final String allFeaturesLabel;

  const _PhoneShell({
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.destinations,
    required this.pages,
    required this.moreLabel,
    required this.allFeaturesLabel,
  });

  @override
  Widget build(BuildContext context) {
    const primary = StudioAdaptiveShell._phonePrimaryIndexes;
    final size = MediaQuery.sizeOf(context);
    final landscape = size.width > size.height;
    final phoneIndex = primary.indexOf(selectedIndex);
    return Scaffold(
      key: const ValueKey('studio-phone-shell'),
      resizeToAvoidBottomInset: false,
      body: _LazyIndexedStack(index: selectedIndex, children: pages),
      bottomNavigationBar: NavigationBar(
        key: const ValueKey('studio-phone-navigation'),
        height: landscape ? 66 : null,
        labelBehavior: landscape
            ? NavigationDestinationLabelBehavior.onlyShowSelected
            : NavigationDestinationLabelBehavior.alwaysShow,
        selectedIndex: phoneIndex < 0 ? primary.length : phoneIndex,
        onDestinationSelected: (index) {
          FocusManager.instance.primaryFocus?.unfocus();
          if (index < primary.length) {
            onDestinationSelected(primary[index]);
          } else {
            _showMoreSheet(context);
          }
        },
        destinations: [
          for (final index in primary)
            NavigationDestination(
              icon: Icon(destinations[index].icon),
              selectedIcon: Icon(destinations[index].selectedIcon),
              label: destinations[index].label,
            ),
          NavigationDestination(
            icon: const Icon(Icons.apps_outlined),
            selectedIcon: const Icon(Icons.apps),
            label: moreLabel,
          ),
        ],
      ),
    );
  }

  Future<void> _showMoreSheet(BuildContext context) async {
    FocusManager.instance.primaryFocus?.unfocus();
    final primary = StudioAdaptiveShell._phonePrimaryIndexes.toSet();
    final target = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        final size = MediaQuery.sizeOf(context);
        final landscape = size.width > size.height;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              StudioSpacing.lg,
              0,
              StudioSpacing.lg,
              StudioSpacing.lg,
            ),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: size.height * 0.82),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(allFeaturesLabel,
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: StudioSpacing.md),
                  Flexible(
                    child: GridView.count(
                      shrinkWrap: true,
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      crossAxisCount: landscape ? 4 : 3,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: landscape ? 1.55 : 1.25,
                      children: [
                        for (var index = 0;
                            index < destinations.length;
                            index++)
                          if (!primary.contains(index))
                            _MoreDestinationButton(
                              destination: destinations[index],
                              selected: selectedIndex == index,
                              onPressed: () {
                                FocusManager.instance.primaryFocus?.unfocus();
                                Navigator.pop(context, index);
                              },
                            ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
    if (target != null) {
      FocusManager.instance.primaryFocus?.unfocus();
      onDestinationSelected(target);
    }
  }
}

class _MoreDestinationButton extends StatelessWidget {
  final StudioDestination destination;
  final bool selected;
  final VoidCallback onPressed;

  const _MoreDestinationButton({
    required this.destination,
    required this.selected,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Material(
      color: selected ? colors.primaryContainer : colors.surfaceContainer,
      borderRadius: BorderRadius.circular(StudioRadii.control),
      child: InkWell(
        borderRadius: BorderRadius.circular(StudioRadii.control),
        onTap: onPressed,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? destination.selectedIcon : destination.icon),
            const SizedBox(height: StudioSpacing.sm),
            Text(destination.label,
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

class _TabletShell extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<StudioDestination> destinations;
  final List<Widget> pages;
  final bool extended;

  const _TabletShell({
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.destinations,
    required this.pages,
    required this.extended,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('studio-tablet-shell'),
      resizeToAvoidBottomInset: false,
      body: SafeArea(
        child: Row(
          children: [
            NavigationRail(
              key: const ValueKey('studio-tablet-navigation'),
              extended: extended,
              minExtendedWidth: 208,
              selectedIndex: selectedIndex,
              onDestinationSelected: (index) {
                FocusManager.instance.primaryFocus?.unfocus();
                onDestinationSelected(index);
              },
              labelType: extended
                  ? NavigationRailLabelType.none
                  : NavigationRailLabelType.selected,
              leading: Padding(
                padding: const EdgeInsets.symmetric(vertical: StudioSpacing.md),
                child: extended
                    ? const Text('Langbai Studio',
                        style: TextStyle(fontWeight: FontWeight.w800))
                    : const Icon(Icons.auto_awesome),
              ),
              destinations: [
                for (final destination in destinations)
                  NavigationRailDestination(
                    icon: Icon(destination.icon),
                    selectedIcon: Icon(destination.selectedIcon),
                    label: Text(destination.label),
                  ),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(
                child:
                    _LazyIndexedStack(index: selectedIndex, children: pages)),
          ],
        ),
      ),
    );
  }
}
