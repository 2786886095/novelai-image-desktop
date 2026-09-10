import 'dart:convert';

const _collections = ['entities', 'facts', 'relations'];
bool _id(dynamic v) => v is String && RegExp(r'^[a-zA-Z0-9_-]{1,80}$').hasMatch(v) && v != 'scene';
bool _text(dynamic v, [int max = 4000]) => v is String && v.length <= max;
String canonicalSceneValue(dynamic value) {
  if (value is List) return '[${value.map(canonicalSceneValue).join(',')}]';
  if (value is Map) {
    final keys = value.keys.cast<String>().toList()..sort();
    return '{${keys.map((k) => '${jsonEncode(k)}:${canonicalSceneValue(value[k])}').join(',')}}';
  }
  return jsonEncode(value);
}

Map<String, dynamic>? readSceneBindings(dynamic value) {
  try {
    if (value is! Map || value['version'] != 1 || value['revision'] is! int || value['revision'] < 0 || value['revision'] > 9007199254740991) return null;
    if (jsonEncode(value).length > 100000 || value.keys.any((k) => !['version','revision',..._collections].contains(k))) return null;
    for (final k in _collections) {
      if (value[k] is! List || (value[k] as List).length > (k == 'entities' ? 100 : 256)) return null;
    }
    final s = jsonDecode(jsonEncode(value)) as Map<String,dynamic>;
    final entities = s['entities'] as List;
    Map? entity(dynamic id) => entities.whereType<Map>().where((e) => e['id'] == id).firstOrNull;
    final ids = <String>{}; final slots = <String>{};
    for (final k in _collections) {
      for (final row in s[k] as List) {
        if (row is! Map || !_id(row['id']) || !ids.add(row['id']) || (row.containsKey('locked') && row['locked'] is! bool)) return null;
      }
    }
    for (final e in entities.cast<Map>()) {
      if (!['character','garment','prop'].contains(e['kind']) || !_text(e['name'],160) || (e['name'] as String).trim().isEmpty || !_text(e['prompt']) || (e['prompt'] as String).trim().isEmpty) return null;
      if (e.keys.any((k) => !['id','kind','name','prompt','subject','ownerId','wearerId','locked','position'].contains(k))) return null;
      if (e['kind'] == 'character') {
        if (!['boy','girl','other'].contains(e['subject']) || e.containsKey('ownerId') || e.containsKey('wearerId')) return null;
      } else if (e.containsKey('subject') || e.containsKey('position')) { return null; }
      for (final k in ['ownerId','wearerId']) { if (e.containsKey(k) && entity(e[k])?['kind'] != 'character') return null; }
      if (e.containsKey('wearerId') && e['kind'] != 'garment') return null;
      if (e.containsKey('position')) {
        final pos = e['position'];
        if (pos is! Map || pos.length != 2 || !['x','y'].every((k) => pos[k] is num && (pos[k] as num).isFinite && pos[k] >= 0 && pos[k] <= 1)) return null;
      }
    }
      for (final f in (s['facts'] as List).cast<Map>()) {
      if (f.keys.any((k) => !['id','entityId','slot','prompt','locked'].contains(k)) || !_text(f['prompt']) || !_text(f['slot'],80) || (f['slot'] as String).trim().isEmpty) return null;
      if (f['entityId'] != 'scene' && entity(f['entityId']) == null) return null;
      if (!slots.add('${f['entityId']}:${f['slot']}')) return null;
    }
    for (final r in (s['relations'] as List).cast<Map>()) {
      if (r.keys.any((k) => !['id','actorId','targetId','action','actorPart','targetPart','locked'].contains(k))) return null;
      if (entity(r['actorId'])?['kind'] != 'character' || entity(r['targetId']) == null || r['actorId'] == r['targetId'] || !_text(r['action'],500) || (r['action'] as String).trim().isEmpty) return null;
      if (['actorPart','targetPart'].any((k) => r.containsKey(k) && !_text(r[k],160))) return null;
    }
    return s;
  } catch (_) { return null; }
}

Map<String,dynamic> applyScenePatch(Map<String,dynamic> input, dynamic value, {bool byUser = false}) {
  final s = readSceneBindings(input);
  if (s == null || value is! Map || value['revision'] != s['revision'] || value['operations'] is! List || (value['operations'] as List).length > (byUser ? 612 : 64)) throw StateError('SCENE_STALE');
  final initial = readSceneBindings(s)!; final seen = <String>{};
  bool ownerLocked(dynamic id) {
    final e = (initial['entities'] as List).cast<Map>().where((e) => e['id'] == id).firstOrNull;
    return e != null && (e['locked'] == true || ['ownerId','wearerId'].any((k) => e[k] != null && (initial['entities'] as List).any((x) => x['id'] == e[k] && x['locked'] == true)));
  }
  for (final op in value['operations'] as List) {
    if (op is! Map || !_collections.contains(op['collection']) || !_id(op['id']) || !op.containsKey('before') || !op.containsKey('after') || !seen.add(op['id'])) throw StateError('SCENE_OPERATION');
    final list = s[op['collection']] as List;
    final at = list.indexWhere((x) => x['id'] == op['id']); final old = at < 0 ? null : list[at] as Map;
    final next = op['after'];
    if (canonicalSceneValue(old) != canonicalSceneValue(op['before']) || (next != null && (next is! Map || next['id'] != op['id']))) throw StateError('SCENE_STALE');
    if (!byUser && [old,next].whereType<Map>().any((x) => x['locked'] == true || ['id','entityId','actorId','targetId','ownerId','wearerId'].any((k) => ownerLocked(x[k])))) throw StateError('SCENE_LOCKED');
    if (!byUser && old != null && next != null && ['kind','entityId','ownerId','wearerId','actorId','targetId','subject'].any((k) => old[k] != next[k])) throw StateError('SCENE_REBIND');
    if (at >= 0) { if (next == null) { list.removeAt(at); } else { list[at] = jsonDecode(jsonEncode(next)); } }
    else if (next != null) { list.add(jsonDecode(jsonEncode(next))); }
    else { throw StateError('SCENE_OPERATION'); }
  }
  if ((value['operations'] as List).isNotEmpty) s['revision'] += 1;
  final checked = readSceneBindings(s);
  if (checked == null) throw StateError('SCENE_INVALID');
  return checked;
}

Map<String,dynamic> compileSceneBindings(Map<String,dynamic> input) {
  final scene = readSceneBindings(input);
  if (scene == null) throw StateError('SCENE_INVALID');
  final entities = (scene['entities'] as List).cast<Map>();
  final people = entities.where((e) => e['kind'] == 'character').toList();
  List<String> facts(String id) => (scene['facts'] as List).where((f) => f['entityId'] == id).map((f) => f['prompt'] as String).where((p) => p.isNotEmpty).toList();
  String describe(Map e) => [e['prompt'],...facts(e['id'])].join(', ');
  String label(String id) { final i = people.indexWhere((e) => e['id'] == id); return i >= 0 ? 'character ${i+1}' : describe(entities.firstWhere((e) => e['id'] == id)); }
  String interaction(Map r) => "${label(r['actorId'])}${(r['actorPart'] ?? '').isNotEmpty ? ' (${r['actorPart']})' : ''}: ${r['action']} -> ${label(r['targetId'])}${(r['targetPart'] ?? '').isNotEmpty ? ' (${r['targetPart']})' : ''}.";
  final counts = ['boy','girl','other'].map((kind) { final n = people.where((e) => e['subject'] == kind).length; return n > 0 ? '$n$kind${n>1?'s':''}' : ''; }).where((p) => p.isNotEmpty);
  final objects = entities.where((e) => e['kind'] != 'character' && e['wearerId'] == null).map((e) => "${describe(e)}${e['ownerId'] != null ? ', owned by ${label(e['ownerId'])}' : ''}.");
  final relations = (scene['relations'] as List).cast<Map>();
  return {
    'positivePrompt': [...counts,...facts('scene'),...objects,...relations.map(interaction)].join(', '),
    'characterPrompts': people.map((e) => {
      'prompt': [e['subject'],e['prompt'],...facts(e['id']),...entities.where((g) => g['wearerId'] == e['id']).map((g) => 'Wearing ${describe(g)}.'),...relations.where((r) => r['actorId'] == e['id'] || r['targetId'] == e['id']).map(interaction)].join(', '),
      'negativePrompt': '', 'useCoords':e['position'] != null,'x':e['position']?['x'] ?? .5,'y':e['position']?['y'] ?? .5,
    }).toList(),
  };
}

const sceneBindingsInstruction = r"""For a FIRST image with characters using a V4/V4.5/V5 model, return an application-owned scene object inside <langbai-image> instead of flattening character facts into positivePrompt.
scene={version:1,revision:0,entities:[{id:"person_a",kind:"character",name:"Person A",subject:"girl",prompt:"woman"},{id:"coat_a",kind:"garment",name:"A's coat",prompt:"coat",ownerId:"person_a",wearerId:"person_a"}],facts:[{id:"setting",entityId:"scene",slot:"setting",prompt:"city street"},{id:"coat_color",entityId:"coat_a",slot:"color",prompt:"red"},{id:"expression_a",entityId:"person_a",slot:"expression",prompt:"smile"}],relations:[]}.
For scenery without characters, use entities:[] and facts bound to entityId:"scene"; never add a person just to fit the schema.
Use stable, distinct IDs for every person, garment, prop, fact and interaction; never use chat-persona IDs. Names are display labels; prompt/action/body-part text is English. Facts belong to an entity and slot, clothing properties to a particular garment. Each character has subject boy/girl/other. Relations use {id,actorId,targetId,action,actorPart?,targetPart?}; ownership, wearing and holding are distinct. An optional character position is {x:0..1,y:0..1}. Do not invent explicit coordinates.
When the current state includes scene, modify ONLY with baseImageId and scenePatch:{revision:CURRENT_REVISION,operations:[{collection:"facts",id:"coat_color",before:EXACT_OLD_OBJECT,after:UPDATED_OBJECT}]}. Collection is entities/facts/relations. Add: before:null; delete:after:null. Keep IDs and unrelated facts byte-for-byte. One fact per entity+slot; change an existing slot instead of appending a contradictory duplicate. Never return full scene or promptPatch to replace an existing bound scene. Parameters-only edits use an empty operations array. Keep every unmentioned fact, even if not locked. Locked items and their descendants must remain unchanged. Ask a concise question when the target is ambiguous or a lock conflicts; do not generate then. Reassigning an owner or interaction endpoint requires user review. Older unstructured images continue using the literal promptPatch contract; never auto-convert them or drop unclassified tags. Never author stylePrompt or negativePrompt.""";
