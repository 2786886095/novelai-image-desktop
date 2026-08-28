import 'package:flutter/material.dart';

import '../i18n/app_locales.dart';

class QualityPresetControl extends StatelessWidget {
  final String language;
  final String model;
  final String value;
  final bool transparentBackground;
  final ValueChanged<String> onChanged;
  final ValueChanged<bool> onTransparentChanged;

  const QualityPresetControl({
    super.key,
    required this.language,
    required this.model,
    required this.value,
    required this.transparentBackground,
    required this.onChanged,
    required this.onTransparentChanged,
  });

  bool get _isV5 => model.startsWith('nai-diffusion-5');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final selected = !_isV5 && value == 'light' ? 'standard' : value;
    final heading = _splitLocalizedLabel(
      mobileUiTextFor(language, 'quality.label'),
    );
    final options = <_QualityOption>[
      _QualityOption(
        value: 'standard',
        shortLabel: mobileUiTextFor(language, 'quality.standardShort'),
        fullLabel: mobileUiTextFor(language, 'quality.standardLabel'),
        description: mobileUiTextFor(language, 'quality.standardDesc'),
      ),
      _QualityOption(
        value: 'light',
        shortLabel: mobileUiTextFor(language, 'quality.lightShort'),
        fullLabel: mobileUiTextFor(language, 'quality.lightLabel'),
        description: mobileUiTextFor(language, 'quality.lightDesc'),
        enabled: _isV5,
      ),
      _QualityOption(
        value: 'none',
        shortLabel: mobileUiTextFor(language, 'quality.noneShort'),
        fullLabel: mobileUiTextFor(language, 'quality.noneLabel'),
        description: mobileUiTextFor(language, 'quality.noneDesc'),
      ),
    ];
    return SizedBox(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(text: heading.$1),
                      if (heading.$2.isNotEmpty)
                        TextSpan(
                          text: '  ${heading.$2}',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: colors.onSurfaceVariant.withOpacity(0.6),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                    ],
                  ),
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: colors.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (_isV5)
                _TransparentChip(
                  label: mobileUiTextFor(language, 'quality.transparent'),
                  tooltip: mobileUiTextFor(language, 'quality.transparentDesc'),
                  selected: transparentBackground,
                  onChanged: onTransparentChanged,
                ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              for (var index = 0; index < options.length; index++) ...[
                if (index > 0) const SizedBox(width: 6),
                Expanded(
                  child: _QualitySegment(
                    option: options[index],
                    selected: options[index].value == selected,
                    v5OnlyLabel: mobileUiTextFor(language, 'quality.v5Only'),
                    onTap: () => onChanged(options[index].value),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 5),
          Text(
            selected == 'none'
                ? mobileUiTextFor(language, 'quality.noneDesc')
                : mobileUiTextFor(language, 'quality.comparisonHint'),
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceVariant.withOpacity(0.72),
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

(String, String) _splitLocalizedLabel(String label) {
  final match = RegExp(r'^(.+?)[（(]([^）)]+)[）)]$').firstMatch(label);
  if (match == null) return (label, '');
  return (match.group(1)?.trim() ?? label, match.group(2)?.trim() ?? '');
}

class _QualityOption {
  final String value;
  final String shortLabel;
  final String fullLabel;
  final String description;
  final bool enabled;

  const _QualityOption({
    required this.value,
    required this.shortLabel,
    required this.fullLabel,
    required this.description,
    this.enabled = true,
  });
}

class _QualitySegment extends StatelessWidget {
  final _QualityOption option;
  final bool selected;
  final String v5OnlyLabel;
  final VoidCallback onTap;

  const _QualitySegment({
    required this.option,
    required this.selected,
    required this.v5OnlyLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final foreground = selected
        ? colors.primary
        : option.enabled
            ? colors.onSurfaceVariant
            : colors.onSurfaceVariant.withOpacity(0.42);

    return Tooltip(
      message: option.enabled
          ? option.description
          : '${option.fullLabel} · $v5OnlyLabel',
      child: Semantics(
        button: true,
        selected: selected,
        enabled: option.enabled,
        label: option.fullLabel,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: option.enabled ? onTap : null,
            borderRadius: BorderRadius.circular(10),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              curve: Curves.easeOutCubic,
              constraints: const BoxConstraints(minHeight: 36),
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 3),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: selected
                    ? colors.primaryContainer.withOpacity(0.72)
                    : colors.surface,
                border: Border.all(
                  color: selected
                      ? colors.primary.withOpacity(0.42)
                      : colors.outlineVariant,
                ),
              ),
              child: Center(
                child: Text(
                  option.shortLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: foreground,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TransparentChip extends StatelessWidget {
  final String label;
  final String tooltip;
  final bool selected;
  final ValueChanged<bool> onChanged;

  const _TransparentChip({
    required this.label,
    required this.tooltip,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        toggled: selected,
        label: label,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => onChanged(!selected),
            borderRadius: BorderRadius.circular(999),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              constraints: const BoxConstraints(minHeight: 28),
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: selected
                    ? colors.primaryContainer
                    : colors.surfaceContainerHigh.withOpacity(0.66),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: selected
                      ? colors.primary.withOpacity(0.46)
                      : colors.outlineVariant,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    selected
                        ? Icons.check_circle_outline
                        : Icons.layers_clear_outlined,
                    size: 15,
                    color: selected ? colors.primary : colors.onSurfaceVariant,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    label,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: selected
                              ? colors.primary
                              : colors.onSurfaceVariant,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
