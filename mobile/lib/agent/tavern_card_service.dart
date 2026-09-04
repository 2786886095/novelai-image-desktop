import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image/image.dart' as image_lib;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'agent_models.dart';

const _langbaiExtension = 'langbai_novelai_studio';
const _pngSignature = <int>[137, 80, 78, 71, 13, 10, 26, 10];

class TavernCardImportResult {
  final TavernCharacter? character;
  final TavernLorebook? lorebook;
  final String format;

  const TavernCardImportResult({
    this.character,
    this.lorebook,
    required this.format,
  });
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<String> _strings(Object? value) => value is List
    ? value
        .map((item) => '$item'.trim())
        .where((item) => item.isNotEmpty)
        .toList()
    : <String>[];

String _text(Object? value, [String fallback = '']) =>
    value is String ? value : fallback;

String uniqueTavernName(Iterable<String> existing, String requested) {
  final occupied = existing.map((item) => item.trim().toLowerCase()).toSet();
  final base = requested.trim().isEmpty ? '新角色' : requested.trim();
  if (!occupied.contains(base.toLowerCase())) return base;
  var index = 1;
  while (occupied.contains('$base ($index)'.toLowerCase())) {
    index++;
  }
  return '$base ($index)';
}

bool isTavernLorebookJson(Map<String, dynamic> raw) =>
    raw.containsKey('entries') &&
    !raw.containsKey('spec') &&
    !raw.containsKey('first_mes') &&
    !raw.containsKey('mes_example') &&
    raw['data'] is! Map;

TavernLorebook _externalLorebook(Object? value, String fallbackName) {
  final raw = _map(value);
  final entries = raw['entries'] is List
      ? raw['entries'] as List
      : _map(raw['entries']).values.toList();
  return TavernLorebook(
    name: _text(raw['name'], fallbackName).trim().isEmpty
        ? fallbackName
        : _text(raw['name'], fallbackName),
    description: _text(raw['description']),
    scanDepth: (raw['scan_depth'] is num
            ? (raw['scan_depth'] as num).round()
            : raw['scanDepth'] is num
                ? (raw['scanDepth'] as num).round()
                : 8)
        .clamp(1, 100),
    tokenBudget: (raw['token_budget'] is num
            ? (raw['token_budget'] as num).round()
            : raw['tokenBudget'] is num
                ? (raw['tokenBudget'] as num).round()
                : 2048)
        .clamp(128, 131072),
    recursiveScanning: raw['recursive_scanning'] == true ||
        raw['recursiveScanning'] == true,
    entries: [
      for (var index = 0; index < entries.length; index++)
        TavernLorebookEntry.fromJson(_map(entries[index]), index),
    ],
    extensions: _map(raw['extensions']),
  );
}

TavernCharacter normalizeExternalCharacter(
  Object? value, {
  String? avatarDataUrl,
}) {
  final root = _map(value);
  final externalSpec = root['spec'] == 'chara_card_v2' ||
      root['spec'] == 'chara_card_v3';
  final data = externalSpec ? _map(root['data']) : root;
  final extensions = _map(data['extensions']);
  final langbai = _map(extensions[_langbaiExtension]);
  final visual = TavernCharacterVisual.fromJson(
      _map(langbai['visual'] ?? langbai['generation']));
  final name = _text(data['name'], '新角色').trim().isEmpty
      ? '新角色'
      : _text(data['name'], '新角色').trim();
  final embedded = data['character_book'] is Map
      ? _externalLorebook(data['character_book'], '$name 世界书')
      : null;
  return TavernCharacter(
    id: _text(langbai['id'] ?? data['id']).trim().isNotEmpty
        ? _text(langbai['id'] ?? data['id'])
        : null,
    spec: root['spec'] == 'chara_card_v2'
        ? 'chara_card_v2'
        : 'chara_card_v3',
    specVersion: _text(
      root['spec_version'],
      root['spec'] == 'chara_card_v2' ? '2.0' : '3.0',
    ),
    name: name,
    nickname: _text(data['nickname']),
    description: _text(data['description']),
    personality: _text(data['personality']),
    scenario: _text(data['scenario']),
    firstMessage: _text(data['first_mes'] ?? data['firstMessage']),
    exampleMessages: _text(data['mes_example'] ?? data['exampleMessages']),
    creatorNotes: _text(data['creator_notes'] ?? data['creatorNotes']),
    systemPrompt: _text(data['system_prompt'] ?? data['systemPrompt']),
    postHistoryInstructions:
        _text(data['post_history_instructions'] ?? data['postHistoryInstructions']),
    alternateGreetings:
        _strings(data['alternate_greetings'] ?? data['alternateGreetings']),
    groupOnlyGreetings:
        _strings(data['group_only_greetings'] ?? data['groupOnlyGreetings']),
    tags: _strings(data['tags']),
    creator: _text(data['creator']),
    characterVersion:
        _text(data['character_version'] ?? data['characterVersion'], '1.0'),
    avatarDataUrl: avatarDataUrl ??
        (_text(langbai['avatarDataUrl']).trim().isEmpty
            ? null
            : _text(langbai['avatarDataUrl'])),
    backgroundDataUrl: _text(langbai['backgroundDataUrl']).trim().isEmpty
        ? null
        : _text(langbai['backgroundDataUrl']),
    lorebookId: _text(langbai['lorebookId']).trim().isEmpty
        ? null
        : _text(langbai['lorebookId']),
    embeddedLorebook: embedded,
    visual: visual,
    extensions: extensions,
    source: _strings(data['source']),
    favorite: langbai['favorite'] == true,
  );
}

Map<String, dynamic> _portableLorebook(TavernLorebook book) => {
      'name': book.name,
      'description': book.description,
      'scan_depth': book.scanDepth,
      'token_budget': book.tokenBudget,
      'recursive_scanning': book.recursiveScanning,
      'extensions': book.extensions,
      'entries': book.entries
          .map((entry) => {
                'keys': entry.keys,
                'secondary_keys': entry.secondaryKeys,
                'content': entry.content,
                'enabled': entry.enabled,
                'constant': entry.constant,
                'selective': entry.selective,
                'case_sensitive': entry.caseSensitive,
                'insertion_order': entry.insertionOrder,
                'priority': entry.priority,
                'position': entry.position,
                if (entry.depth != null) 'depth': entry.depth,
                if (entry.comment != null) 'comment': entry.comment,
                'extensions': entry.extensions,
              })
          .toList(),
    };

Map<String, dynamic> tavernCharacterToV3(TavernCharacter character) {
  final extensions = Map<String, dynamic>.from(character.extensions);
  extensions[_langbaiExtension] = {
    'schema_version': 1,
    'id': character.id,
    'favorite': character.favorite,
    'createdAt': character.createdAt,
    'updatedAt': character.updatedAt,
    if (character.backgroundDataUrl != null)
      'backgroundDataUrl': character.backgroundDataUrl,
    if (character.lorebookId != null) 'lorebookId': character.lorebookId,
    'visual': character.visual.toJson(),
  };
  return {
    'spec': 'chara_card_v3',
    'spec_version': '3.0',
    'data': {
      'name': character.name,
      'nickname': character.nickname,
      'description': character.description,
      'personality': character.personality,
      'scenario': character.scenario,
      'first_mes': character.firstMessage,
      'mes_example': character.exampleMessages,
      'creator_notes': character.creatorNotes,
      'system_prompt': character.systemPrompt,
      'post_history_instructions': character.postHistoryInstructions,
      'alternate_greetings': character.alternateGreetings,
      'group_only_greetings': character.groupOnlyGreetings,
      'tags': character.tags,
      'creator': character.creator,
      'character_version': character.characterVersion,
      if (character.embeddedLorebook != null)
        'character_book': _portableLorebook(character.embeddedLorebook!),
      'source': character.source,
      'creation_date': DateTime.tryParse(character.createdAt)
          ?.millisecondsSinceEpoch,
      'modification_date': DateTime.tryParse(character.updatedAt)
          ?.millisecondsSinceEpoch,
      'extensions': extensions,
    },
  };
}

Map<String, dynamic> tavernCharacterToV2(TavernCharacter character) {
  final v3 = tavernCharacterToV3(character);
  final data = Map<String, dynamic>.from(v3['data'] as Map);
  data
    ..remove('nickname')
    ..remove('group_only_greetings')
    ..remove('source')
    ..remove('creation_date')
    ..remove('modification_date');
  return {'spec': 'chara_card_v2', 'spec_version': '2.0', 'data': data};
}

int _readUint32(Uint8List bytes, int offset) =>
    ByteData.sublistView(bytes, offset, offset + 4).getUint32(0);

Uint8List _uint32(int value) {
  final output = Uint8List(4);
  ByteData.sublistView(output).setUint32(0, value);
  return output;
}

int _crc32(List<int> bytes) {
  var crc = 0xffffffff;
  for (final byte in bytes) {
    crc ^= byte;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 1) == 1
          ? (crc >> 1) ^ 0xedb88320
          : crc >> 1;
    }
  }
  return (crc ^ 0xffffffff) & 0xffffffff;
}

Uint8List _pngTextChunk(String keyword, String value) {
  final type = ascii.encode('tEXt');
  final data = Uint8List.fromList([
    ...latin1.encode(keyword),
    0,
    ...latin1.encode(value),
  ]);
  final checksum = _crc32([...type, ...data]);
  return Uint8List.fromList([
    ..._uint32(data.length),
    ...type,
    ...data,
    ..._uint32(checksum),
  ]);
}

Map<String, String> _readPngText(Uint8List bytes) {
  if (bytes.length < 12 ||
      !_pngSignature.asMap().entries.every(
          (entry) => bytes[entry.key] == entry.value)) {
    throw const FormatException('不是有效的 PNG 角色卡。');
  }
  final output = <String, String>{};
  var offset = 8;
  while (offset + 12 <= bytes.length) {
    final length = _readUint32(bytes, offset);
    if (length > 32 * 1024 * 1024 || offset + 12 + length > bytes.length) {
      throw const FormatException('PNG 数据块损坏。');
    }
    final type = ascii.decode(bytes.sublist(offset + 4, offset + 8));
    final start = offset + 8;
    final end = start + length;
    if (type == 'tEXt') {
      final data = bytes.sublist(start, end);
      final separator = data.indexOf(0);
      if (separator > 0) {
        final key = latin1.decode(data.sublist(0, separator));
        final value = latin1.decode(data.sublist(separator + 1));
        if (key == 'chara' || key == 'ccv3') output[key] = value;
      }
    }
    offset = end + 4;
    if (type == 'IEND') break;
  }
  return output;
}

Uint8List _writePngCard(
  Uint8List source,
  Map<String, dynamic> v2,
  Map<String, dynamic> v3,
) {
  _readPngText(source);
  final output = BytesBuilder()..add(_pngSignature);
  var offset = 8;
  while (offset + 12 <= source.length) {
    final length = _readUint32(source, offset);
    final end = offset + 12 + length;
    if (end > source.length) throw const FormatException('PNG 数据块损坏。');
    final type = ascii.decode(source.sublist(offset + 4, offset + 8));
    var keep = true;
    if (type == 'tEXt') {
      final data = source.sublist(offset + 8, offset + 8 + length);
      final separator = data.indexOf(0);
      if (separator > 0) {
        final key = latin1.decode(data.sublist(0, separator));
        keep = key != 'chara' && key != 'ccv3';
      }
    }
    if (type == 'IEND') {
      output
        ..add(_pngTextChunk('chara', base64Encode(utf8.encode(jsonEncode(v2)))))
        ..add(_pngTextChunk('ccv3', base64Encode(utf8.encode(jsonEncode(v3)))))
        ..add(source.sublist(offset, end));
      break;
    }
    if (keep) output.add(source.sublist(offset, end));
    offset = end;
  }
  return output.takeBytes();
}

Uint8List _dataUrlBytes(String value) {
  final comma = value.indexOf(',');
  if (!value.startsWith('data:') || comma < 0) {
    throw const FormatException('图片数据无效。');
  }
  return base64Decode(value.substring(comma + 1));
}

String _safeName(String value) {
  final safe = value.replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1f]'), '_').trim();
  return safe.isEmpty ? 'character' : safe;
}

class TavernCardService {
  const TavernCardService();

  Future<TavernCardImportResult?> pickAndImport({
    Iterable<String> existingCharacterNames = const [],
    Iterable<String> existingLorebookNames = const [],
  }) async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['png', 'json', 'charx'],
      withData: true,
    );
    if (picked == null || picked.files.isEmpty) return null;
    final selected = picked.files.single;
    final bytes = selected.bytes ??
        (selected.path == null
            ? null
            : await File(selected.path!).readAsBytes());
    if (bytes == null || bytes.isEmpty || bytes.length > 64 * 1024 * 1024) {
      throw const FormatException('角色卡为空或超过 64 MB。');
    }
    final extension = p.extension(selected.name).toLowerCase();
    if (extension == '.png') {
      final text = _readPngText(bytes);
      final encoded = text['ccv3'] ?? text['chara'];
      if (encoded == null) {
        throw const FormatException('PNG 中没有找到 ccv3 或 chara 角色卡数据。');
      }
      final decoded = jsonDecode(utf8.decode(base64Decode(encoded)));
      final character = normalizeExternalCharacter(
        decoded,
        avatarDataUrl: 'data:image/png;base64,${base64Encode(bytes)}',
      );
      character.name =
          uniqueTavernName(existingCharacterNames, character.name);
      return TavernCardImportResult(character: character, format: 'png');
    }
    if (extension == '.charx') {
      final archive = ZipDecoder().decodeBytes(bytes, verify: true);
      final total = archive.files.fold<int>(0, (sum, file) => sum + file.size);
      if (total > 96 * 1024 * 1024) {
        throw const FormatException('CHARX 解压后超过 96 MB。');
      }
      final cardFile = archive.files
          .where((file) => file.isFile && p.posix.basename(file.name) == 'card.json')
          .firstOrNull;
      if (cardFile == null) throw const FormatException('CHARX 缺少 card.json。');
      final root = jsonDecode(utf8.decode(cardFile.content as List<int>));
      final avatar = archive.files.where((file) {
        final lower = file.name.toLowerCase();
        return file.isFile &&
            (lower.endsWith('.png') ||
                lower.endsWith('.jpg') ||
                lower.endsWith('.jpeg') ||
                lower.endsWith('.webp')) &&
            lower.contains('icon');
      }).firstOrNull;
      String? avatarDataUrl;
      if (avatar != null) {
        final lower = avatar.name.toLowerCase();
        final mime = lower.endsWith('.webp')
            ? 'image/webp'
            : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
                ? 'image/jpeg'
                : 'image/png';
        avatarDataUrl =
            'data:$mime;base64,${base64Encode(avatar.content as List<int>)}';
      }
      final character =
          normalizeExternalCharacter(root, avatarDataUrl: avatarDataUrl);
      character.name =
          uniqueTavernName(existingCharacterNames, character.name);
      return TavernCardImportResult(character: character, format: 'charx');
    }
    final root = jsonDecode(utf8.decode(bytes));
    final raw = _map(root);
    final looksLikeLorebook = isTavernLorebookJson(raw);
    if (looksLikeLorebook) {
      final lorebook = _externalLorebook(raw, '导入世界书');
      lorebook.name = uniqueTavernName(existingLorebookNames, lorebook.name);
      return TavernCardImportResult(lorebook: lorebook, format: 'json');
    }
    final character = normalizeExternalCharacter(root);
    character.name = uniqueTavernName(existingCharacterNames, character.name);
    return TavernCardImportResult(character: character, format: 'json');
  }

  Future<String?> pickVisualDataUrl({bool background = false}) async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (picked == null || picked.files.isEmpty) return null;
    final selected = picked.files.single;
    final bytes = selected.bytes ??
        (selected.path == null
            ? null
            : await File(selected.path!).readAsBytes());
    if (bytes == null || bytes.isEmpty || bytes.length > 32 * 1024 * 1024) {
      throw const FormatException('图片为空或超过 32 MB。');
    }
    final decoded = image_lib.decodeImage(bytes);
    if (decoded == null) throw const FormatException('无法识别图片。');
    final maximum = background ? 1920 : 768;
    final longest = decoded.width > decoded.height ? decoded.width : decoded.height;
    final resized = longest > maximum
        ? image_lib.copyResize(
            decoded,
            width: decoded.width >= decoded.height ? maximum : null,
            height: decoded.height > decoded.width ? maximum : null,
            interpolation: image_lib.Interpolation.average,
          )
        : decoded;
    final encoded = image_lib.encodeJpg(resized, quality: 88);
    return 'data:image/jpeg;base64,${base64Encode(encoded)}';
  }

  Future<File> exportCharacter(
    TavernCharacter character,
    String format,
  ) async {
    final directory = await getTemporaryDirectory();
    final safe = _safeName(character.name);
    final v3 = tavernCharacterToV3(character);
    late final Uint8List bytes;
    late final String extension;
    if (format == 'png') {
      if (character.avatarDataUrl == null) {
        throw const FormatException('导出 PNG 角色卡前请先设置角色头像。');
      }
      final source = image_lib.decodeImage(_dataUrlBytes(character.avatarDataUrl!));
      if (source == null) throw const FormatException('角色头像无法转换为 PNG。');
      final avatar = Uint8List.fromList(image_lib.encodePng(source));
      bytes = _writePngCard(avatar, tavernCharacterToV2(character), v3);
      extension = 'png';
    } else if (format == 'charx') {
      final archive = Archive();
      final card = utf8.encode(jsonEncode(v3));
      archive.addFile(ArchiveFile('card.json', card.length, card));
      if (character.avatarDataUrl != null) {
        final source = image_lib.decodeImage(_dataUrlBytes(character.avatarDataUrl!));
        if (source == null) throw const FormatException('角色头像无法写入 CHARX。');
        final avatar = image_lib.encodePng(source);
        archive.addFile(ArchiveFile(
          'assets/icon/images/avatar.png',
          avatar.length,
          avatar,
        ));
      }
      bytes = Uint8List.fromList(ZipEncoder().encode(archive) ?? const []);
      extension = 'charx';
    } else {
      bytes = Uint8List.fromList(
        utf8.encode(const JsonEncoder.withIndent('  ').convert(v3)),
      );
      extension = 'json';
    }
    final file = File(p.join(directory.path, '$safe.$extension'));
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<void> shareCharacter(
    TavernCharacter character,
    String format,
  ) async {
    final file = await exportCharacter(character, format);
    await Share.shareXFiles(
      [XFile(file.path)],
      text: '${character.name} · SillyTavern Character Card',
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}
