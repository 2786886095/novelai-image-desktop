import 'dart:convert';
import '../models/nai_models.dart';

String _model(String key) =>
    const {
      'v4full': 'nai-diffusion-4-full',
      'v4curated': 'nai-diffusion-4-curated-preview',
      'v4-5full': 'nai-diffusion-4-5-full',
      'v4-5curated': 'nai-diffusion-4-5-curated'
    }[key] ??
    key;
Map<String, dynamic> _obj(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : {};
double _unit(dynamic v, double fallback) {
  if (v == null) return fallback;
  if (v is! num || !v.isFinite || v < 0 || v > 1) {
    throw const FormatException('Invalid Vibe parameter (0–1).');
  }
  return v.toDouble();
}

String _data(dynamic v) {
  if (v is! String ||
      v.isEmpty ||
      v.length > 70000000 ||
      v.length % 4 != 0 ||
      !RegExp(r'^[A-Za-z0-9+/]+={0,2}$').hasMatch(v)) {
    throw const FormatException('Invalid Vibe data.');
  }
  return v;
}

List<VibeTransferItem> parseVibeFile(String text) {
  if (text.length > 70000000) {
    throw const FormatException('Vibe file exceeds 50 MB.');
  }
  final root = _obj(jsonDecode(text.replaceFirst(RegExp('^\uFEFF'), '')));
  if (root['version'] != 1) {
    throw const FormatException('Unsupported Vibe file version.');
  }
  final list = root['identifier'] == 'novelai-vibe-transfer-bundle'
      ? root['vibes']
      : root['identifier'] == 'novelai-vibe-transfer'
          ? [root]
          : null;
  if (list is! List || list.isEmpty || list.length > 16) {
    throw const FormatException('Expected a Vibe file with 1–16 references.');
  }
  return list.map((raw) {
    final v = _obj(raw), info = _obj(_obj(raw)['importInfo']);
    if (v['identifier'] != 'novelai-vibe-transfer' ||
        v['version'] != 1 ||
        !['image', 'encoding'].contains(v['type'])) {
      throw const FormatException('Unsupported Vibe entry.');
    }
    final encodings = <VibeEncoding>[];
    for (final entry in _obj(v['encodings']).entries) {
      for (final raw in _obj(entry.value).values) {
        final e = _obj(raw);
        final extracted = _obj(e['params'])['information_extracted'] ??
            (_model(entry.key) == _model('${info['model']}')
                ? info['information_extracted']
                : null);
        if (extracted == null) continue;
        encodings.add(VibeEncoding(
            model: _model(entry.key),
            infoExtracted: _unit(extracted, 1),
            encoding: _data(e['encoding'])));
      }
    }
    final image =
        v['type'] == 'image' && v['image'] != null ? _data(v['image']) : '';
    if (image.isNotEmpty && !RegExp(r'^(iVBOR|/9j/|UklGR)').hasMatch(image)) {
      throw const FormatException('Unsupported Vibe image format.');
    }
    if (image.isEmpty && encodings.isEmpty) {
      throw const FormatException('No usable image or Vibe encoding.');
    }
    final extracted = _unit(info['information_extracted'],
        encodings.isEmpty ? 1 : encodings.first.infoExtracted);
    if (image.isEmpty &&
        !encodings.any((e) => (e.infoExtracted - extracted).abs() < 1e-8)) {
      throw const FormatException(
          'Vibe extraction value has no matching encoding.');
    }
    return VibeTransferItem(
        base64: image,
        name: v['name'] is String
            ? (v['name'] as String)
                .substring(0, (v['name'] as String).length.clamp(0, 160))
            : '',
        infoExtracted: extracted,
        strength: _unit(info['strength'], 1),
        encodings: encodings);
  }).toList();
}

String exportVibeFile(List<VibeTransferItem> items) => jsonEncode({
      'identifier': 'novelai-vibe-transfer-bundle',
      'version': 1,
      'vibes': items.asMap().entries.map((entry) {
        final v = entry.value, encodings = <String, Map<String, dynamic>>{};
        for (final e in v.encodings) {
          (encodings[const {
                'nai-diffusion-4-full': 'v4full',
                'nai-diffusion-4-curated-preview': 'v4curated',
                'nai-diffusion-4-5-full': 'v4-5full',
                'nai-diffusion-4-5-curated': 'v4-5curated'
              }[e.model] ??
              e.model] ??= {})['${e.infoExtracted}'] = {
            'encoding': e.encoding,
            'params': {'information_extracted': e.infoExtracted}
          };
        }
        return {
          'identifier': 'novelai-vibe-transfer',
          'version': 1,
          'type': v.base64.isEmpty ? 'encoding' : 'image',
          'name': v.name,
          if (v.base64.isNotEmpty) 'image': v.base64,
          'encodings': encodings,
          'importInfo': {
            'model': v.encodings.isEmpty ? null : v.encodings.first.model,
            'information_extracted': v.infoExtracted,
            'strength': v.strength
          }
        };
      }).toList()
    });
List<String> vibeFileLabels(String language) =>
    const {
      'zh-CN': ['导入 Vibe 文件', '导出 Vibe 文件', '编码参考（无原图）', '已导入 Vibe 参考'],
      'zh-TW': ['匯入 Vibe 檔案', '匯出 Vibe 檔案', '編碼參考（無原圖）', '已匯入 Vibe 參考'],
      'ja-JP': [
        'Vibe ファイルを読込',
        'Vibe ファイルを書出し',
        'エンコード参照（元画像なし）',
        'Vibe を読み込みました'
      ],
      'ko-KR': [
        'Vibe 파일 가져오기',
        'Vibe 파일 내보내기',
        '인코딩 참조 (원본 없음)',
        'Vibe를 가져왔습니다'
      ],
    }[language] ??
    [
      'Import Vibe file',
      'Export Vibe file',
      'Encoded reference (no image)',
      'Vibe references imported'
    ];
