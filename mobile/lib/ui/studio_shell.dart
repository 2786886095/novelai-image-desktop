import 'package:flutter/material.dart';

enum StudioWindowClass { phone, tablet, wideTablet }

abstract final class StudioBreakpoints {
  static const double tablet = 600;
  static const double wideTablet = 1180;

  static StudioWindowClass classify(double width) {
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
    final phone =
        StudioBreakpoints.classify(MediaQuery.sizeOf(context).width) ==
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

  static const _phonePrimaryIndexes = [0, 1, 6];

  @override
  Widget build(BuildContext context) {
    final windowClass =
        StudioBreakpoints.classify(MediaQuery.sizeOf(context).width);
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
    final phoneIndex = primary.indexOf(selectedIndex);
    return Scaffold(
      key: const ValueKey('studio-phone-shell'),
      body: IndexedStack(index: selectedIndex, children: pages),
      bottomNavigationBar: NavigationBar(
        key: const ValueKey('studio-phone-navigation'),
        selectedIndex: phoneIndex < 0 ? primary.length : phoneIndex,
        onDestinationSelected: (index) {
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
    final primary = StudioAdaptiveShell._phonePrimaryIndexes.toSet();
    final target = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(allFeaturesLabel,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 3,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 1.25,
                children: [
                  for (var index = 0; index < destinations.length; index++)
                    if (!primary.contains(index))
                      _MoreDestinationButton(
                        destination: destinations[index],
                        selected: selectedIndex == index,
                        onPressed: () => Navigator.pop(context, index),
                      ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (target != null) onDestinationSelected(target);
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
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onPressed,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? destination.selectedIcon : destination.icon),
            const SizedBox(height: 6),
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
      body: SafeArea(
        child: Row(
          children: [
            NavigationRail(
              key: const ValueKey('studio-tablet-navigation'),
              extended: extended,
              minExtendedWidth: 208,
              selectedIndex: selectedIndex,
              onDestinationSelected: onDestinationSelected,
              labelType: extended
                  ? NavigationRailLabelType.none
                  : NavigationRailLabelType.selected,
              leading: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
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
                child: IndexedStack(index: selectedIndex, children: pages)),
          ],
        ),
      ),
    );
  }
}
