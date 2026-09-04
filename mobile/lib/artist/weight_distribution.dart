import 'dart:math';

enum WeightControlMode { novice, advanced }

class WeightDistributionConfig {
  final double mode;
  final double leftDispersion;
  final double rightDispersion;
  final double softBalance;

  const WeightDistributionConfig({
    this.mode = 0.8,
    this.leftDispersion = 0.4,
    this.rightDispersion = 0.4,
    this.softBalance = 0,
  });
}

double _finiteClamp(double value, double fallback, double min, double max) =>
    value.isFinite ? value.clamp(min, max).toDouble() : fallback;

WeightDistributionConfig normalizeWeightDistribution(
  WeightDistributionConfig value,
  double minWeight,
  double maxWeight,
) {
  final lower = min(minWeight, maxWeight);
  final upper = max(minWeight, maxWeight);
  return WeightDistributionConfig(
    mode: _finiteClamp(value.mode, (lower + upper) / 2, lower, upper),
    leftDispersion: _finiteClamp(value.leftDispersion, 0.4, 0, 1),
    rightDispersion: _finiteClamp(value.rightDispersion, 0.4, 0, 1),
    softBalance: _finiteClamp(value.softBalance, 0, 0, 1),
  );
}

/// Applies one shared translation to the whole artist string. Relative gaps
/// remain unchanged unless an item reaches the configured bounds.
List<double> softBalanceWeights(
  List<double> weights,
  double minWeight,
  double maxWeight,
  WeightDistributionConfig value,
) {
  if (weights.isEmpty) return const [];
  final lower = min(minWeight, maxWeight);
  final upper = max(minWeight, maxWeight);
  final config = normalizeWeightDistribution(value, lower, upper);
  if (config.softBalance <= 0) return List<double>.from(weights);
  final mean = weights.reduce((a, b) => a + b) / weights.length;
  final shift = (config.mode - mean) * config.softBalance;
  return weights
      .map((weight) => ((weight + shift).clamp(lower, upper) * 10).round() / 10)
      .toList(growable: false);
}

double controlledWeightCdf(
  double value,
  double minWeight,
  double maxWeight,
  WeightDistributionConfig raw,
) {
  final lower = min(minWeight, maxWeight);
  final upper = max(minWeight, maxWeight);
  final config = normalizeWeightDistribution(raw, lower, upper);
  if (value <= lower) return 0;
  if (value >= upper) return 1;
  final leftWidth = max(0.0, config.mode - lower);
  final rightWidth = max(0.0, upper - config.mode);
  final totalWidth = leftWidth + rightWidth;
  if (totalWidth <= 0) return value < config.mode ? 0 : 1;
  if (value <= config.mode) {
    if (leftWidth <= 0) return 0;
    final beta = 12 - 11 * config.leftDispersion;
    final unit = ((value - lower) / leftWidth).clamp(0, 1).toDouble();
    return leftWidth / totalWidth * pow(unit, beta).toDouble();
  }
  if (rightWidth <= 0) return 1;
  final beta = 12 - 11 * config.rightDispersion;
  final unit = ((value - config.mode) / rightWidth).clamp(0, 1).toDouble();
  return leftWidth / totalWidth +
      rightWidth / totalWidth * (1 - pow(1 - unit, beta).toDouble());
}

List<double> buildWeightDistributionPreview(
  double minWeight,
  double maxWeight,
  WeightDistributionConfig config, {
  int binCount = 36,
}) {
  final lower = min(minWeight, maxWeight);
  final upper = max(minWeight, maxWeight);
  final count = binCount.clamp(8, 96);
  final span = upper - lower;
  if (span <= 0) return const [1];
  return List<double>.generate(count, (index) {
    final start = lower + span * index / count;
    final end = lower + span * (index + 1) / count;
    return max(
      0,
      controlledWeightCdf(end, lower, upper, config) -
          controlledWeightCdf(start, lower, upper, config),
    );
  }, growable: false);
}

/// Independently implemented split distribution. Dispersion 0 clusters near
/// the mode; dispersion 1 approaches a uniform sample on the selected side.
double sampleControlledWeight(
  Random random,
  double minWeight,
  double maxWeight,
  WeightDistributionConfig value,
) {
  final lower = min(minWeight, maxWeight);
  final upper = max(minWeight, maxWeight);
  if (lower == upper) return lower;
  final config = normalizeWeightDistribution(value, lower, upper);
  final leftWidth = max(0.0, config.mode - lower);
  final rightWidth = max(0.0, upper - config.mode);
  final totalWidth = leftWidth + rightWidth;
  final chooseLeft = leftWidth > 0 &&
      (rightWidth == 0 || random.nextDouble() < leftWidth / totalWidth);
  final width = chooseLeft ? leftWidth : rightWidth;
  if (width == 0) return config.mode;
  final dispersion =
      chooseLeft ? config.leftDispersion : config.rightDispersion;
  final concentration = 12 - 11 * dispersion;
  final unit = random.nextDouble().clamp(0, 1 - double.minPositive);
  final distance = width * (1 - pow(1 - unit, 1 / concentration).toDouble());
  final sampled = chooseLeft ? config.mode - distance : config.mode + distance;
  return (sampled.clamp(lower, upper) * 10).round() / 10;
}
