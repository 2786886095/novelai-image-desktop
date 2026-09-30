import 'dart:convert';
import '../services/gallery_favorites.dart';

const collectionActionCatalog = <String, Map<String, dynamic>>{
  'favorites.online.list': {'title': '读取在线收藏（不包含本地生成原图）', 'effect': 'read'},
  'favorites.online.add': {
    'title': '保存在线画廊书签，不下载原图',
    'effect': 'write',
    'fields': ['item'],
    'help':
        'item 使用画廊搜索所得 source/id/title/images[{url,thumb}]，可含 author/sourceUrl/prompt/negativePrompt/createdAt/score；不要伪造链接。'
  },
  'favorites.online.remove': {
    'title': '移除在线书签（不删除本地图片）',
    'effect': 'confirm',
    'fields': ['id'],
    'help': 'id 使用列表返回的 key（source:id）。'
  },
};

class CollectionActions {
  final GalleryFavoritesStore store;
  CollectionActions({GalleryFavoritesStore? store})
      : store = store ?? GalleryFavoritesStore.instance;
  bool handles(String action) => collectionActionCatalog.containsKey(action);
  Future<Map<String, dynamic>> execute(Map<String, dynamic> args) async {
    final action = args['action'], spec = collectionActionCatalog[action];
    if (spec == null) throw StateError('此平台未接通该收藏操作');
    for (final key in args.keys) {
      if (![
        'action',
        'expectedRevision',
        'offset',
        'limit',
        ...List<String>.from(spec['fields'] ?? [])
      ].contains(key)) throw StateError('未知操作参数：$key');
    }
    final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
    if (offset is! int ||
        offset < 0 ||
        offset > 1000000 ||
        limit is! int ||
        limit < 1 ||
        limit > 50) throw StateError('分页参数无效');
    if (spec['effect'] != 'read') {
      final revision = args['expectedRevision'];
      if (revision is! String || revision.isEmpty) {
        throw StateError('请先读取同类资料并传入 expectedRevision');
      }
      if (action == 'favorites.online.add') {
        final raw = args['item'];
        if (raw is! Map || jsonEncode(raw).length > 100000) {
          throw StateError('item 必须为画廊书签对象（最大100KB）');
        }
        const fields = [
          'source',
          'id',
          'title',
          'author',
          'sourceUrl',
          'prompt',
          'negativePrompt',
          'createdAt',
          'score',
          'images'
        ];
        final clean = <String, dynamic>{
          for (final key in fields)
            if (raw.containsKey(key)) key: raw[key],
          'savedAt': DateTime.now().millisecondsSinceEpoch
        };
        if (clean['images'] is! List || (clean['images'] as List).length > 100) {
          throw StateError('images 必须是最多100项的链接列表');
        }
        final item = GalleryFavorite.fromJson(clean);
        if (item.id.length > 200 || item.title.length > 500) {
          throw StateError('书签名称或ID过长');
        }
        await store.mutate(expectedRevision: revision, add: item);
      } else {
        final id = args['id'];
        if (id is! String || id.isEmpty || id.length > 400) {
          throw StateError('书签ID无效');
        }
        await store.mutate(expectedRevision: revision, removeKey: id);
      }
    }
    final state = await store.snapshot(), items = state['items'] as List;
    return {
      'action': action,
      'revision': state['revision'],
      'executed': spec['effect'] != 'read',
      'readback': items.skip(offset).take(limit).toList(),
      'total': items.length,
      'offset': offset,
      'nextOffset': offset + limit < items.length ? offset + limit : null
    };
  }
}
