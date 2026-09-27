import 'dart:convert';

/// Same persisted shape as desktop, including portable custom audio.
class CompletionSound {
  final bool enabled;
  final double volume;
  final String dataUrl, name;
  const CompletionSound(
      {this.enabled = false,
      this.volume = .5,
      this.dataUrl = '',
      this.name = ''});
  factory CompletionSound.fromJson(dynamic value) {
    final v = value is Map ? value : const {};
    final raw = v['dataUrl'];
    var data = '';
    if (raw is String &&
        raw.length <= 1500000 &&
        RegExp(r'^data:audio/(?:mpeg|mp3|wav|x-wav|wave|ogg);base64,[a-zA-Z0-9+/=]+$')
            .hasMatch(raw)) {
      try {
        if (base64Decode(raw.split(',')[1]).length <= 1048576) data = raw;
      } catch (_) {}
    }
    final vol = v['volume'];
    final label = v['name'] is String ? v['name'] as String : '';
    return CompletionSound(
        enabled: v['enabled'] == true,
        volume: vol is num && vol.isFinite ? vol.toDouble().clamp(0, 1) : .5,
        dataUrl: data,
        name:
            data.isEmpty ? '' : label.substring(0, label.length.clamp(0, 160)));
  }
  Map<String, dynamic> toJson() =>
      {'enabled': enabled, 'volume': volume, 'dataUrl': dataUrl, 'name': name};
  CompletionSound copyWith(
          {bool? enabled, double? volume, String? dataUrl, String? name}) =>
      CompletionSound.fromJson({
        ...toJson(),
        if (enabled != null) 'enabled': enabled,
        if (volume != null) 'volume': volume,
        if (dataUrl != null) 'dataUrl': dataUrl,
        if (name != null) 'name': name
      });
}
