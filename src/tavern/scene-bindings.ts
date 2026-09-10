/** Application-owned bindings. Chat personas and image entities have separate IDs. */
export interface SceneEntity {
  id: string; kind: "character" | "garment" | "prop"; name: string; prompt: string;
  subject?: "boy" | "girl" | "other"; ownerId?: string; wearerId?: string;
  locked?: boolean; position?: { x: number; y: number };
}
export interface SceneFact { id: string; entityId: string; slot: string; prompt: string; locked?: boolean }
export interface SceneRelation {
  id: string; actorId: string; targetId: string; action: string;
  actorPart?: string; targetPart?: string; locked?: boolean;
}
export interface SceneBindings {
  version: 1; revision: number; entities: SceneEntity[]; facts: SceneFact[]; relations: SceneRelation[];
}
type Collection = "entities" | "facts" | "relations";
export interface SceneOperation { collection: Collection; id: string; before: unknown; after: unknown }
export interface ScenePatch { revision: number; operations: SceneOperation[] }
const collections: Collection[] = ["entities", "facts", "relations"];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idOk = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v) && v !== "scene";
const str = (v: unknown, max = 4000) => typeof v === "string" && v.length <= max;
export function canonicalSceneValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSceneValue).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalSceneValue(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Reject a malformed scene as a whole; never filter away an unrecognised binding. */
export function readSceneBindings(value: unknown): SceneBindings | undefined {
  if (!record(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0) return;
  if (JSON.stringify(value).length > 100000 || Object.keys(value).some(k => !["version", "revision", ...collections].includes(k))) return;
  if (collections.some(k => !Array.isArray(value[k]) || value[k].length > (k === "entities" ? 100 : 256))) return;
  const s = value as unknown as SceneBindings;
  const ids = new Set<string>(); const slots = new Set<string>();
  const entity = (id: string | undefined) => s.entities.find(e => e.id === id);
  for (const collection of collections) for (const row of s[collection]) {
    if (!record(row) || !idOk(row.id) || ids.has(row.id) || (row.locked !== undefined && typeof row.locked !== "boolean")) return;
    ids.add(row.id);
  }
  for (const e of s.entities) {
    if (!['character','garment','prop'].includes(e.kind) || !str(e.name,160) || !e.name.trim() || !str(e.prompt) || !e.prompt.trim()) return;
    if (Object.keys(e).some(k => !['id','kind','name','prompt','subject','ownerId','wearerId','locked','position'].includes(k))) return;
    if (e.kind === 'character') {
      if (!['boy','girl','other'].includes(e.subject ?? '') || e.ownerId !== undefined || e.wearerId !== undefined) return;
    } else if (e.subject !== undefined || e.position !== undefined) return;
    for (const owner of [e.ownerId, e.wearerId]) if (owner !== undefined && entity(owner)?.kind !== 'character') return;
    if (e.wearerId !== undefined && e.kind !== 'garment') return;
    if (e.position !== undefined && (!record(e.position) || Object.keys(e.position).sort().join(',') !== 'x,y' || ![e.position.x,e.position.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1))) return;
  }
  for (const f of s.facts) {
    if (Object.keys(f).some(k => !['id','entityId','slot','prompt','locked'].includes(k)) || !str(f.prompt) || !str(f.slot,80) || !f.slot.trim()) return;
    if (f.entityId !== 'scene' && !entity(f.entityId)) return;
    const key = `${f.entityId}:${f.slot}`;
    if (slots.has(key)) return;
    slots.add(key);
  }
  for (const r of s.relations) {
    if (Object.keys(r).some(k => !['id','actorId','targetId','action','actorPart','targetPart','locked'].includes(k))) return;
    if (entity(r.actorId)?.kind !== 'character' || !entity(r.targetId) || r.actorId === r.targetId || !str(r.action,500) || !r.action.trim()) return;
    if ([r.actorPart,r.targetPart].some(p => p !== undefined && !str(p,160))) return;
  }
  return JSON.parse(JSON.stringify(s)) as SceneBindings;
}

/** Compare-and-swap batch. AI may neither unlock nor bypass an owning entity's lock. */
export function applyScenePatch(input: SceneBindings, value: unknown, byUser = false): SceneBindings {
  const s = readSceneBindings(input);
  if (!s || !record(value) || value.revision !== s.revision || !Array.isArray(value.operations) || value.operations.length > (byUser ? 612 : 64)) throw Error('SCENE_STALE');
  const initial = readSceneBindings(s)!; const seen = new Set<string>();
  const ownerLocked = (id: unknown): boolean => {
    const e = initial.entities.find(e => e.id === id);
    return !!e && (!!e.locked || [e.ownerId,e.wearerId].some(p => p && initial.entities.find(x => x.id === p)?.locked));
  };
  for (const op of value.operations) {
    if (!record(op) || !collections.includes(op.collection as Collection) || !idOk(op.id) || !('before' in op) || !('after' in op) || seen.has(op.id)) throw Error('SCENE_OPERATION');
    seen.add(op.id);
    const list = s[op.collection as Collection] as unknown as Record<string,unknown>[];
    const at = list.findIndex(x => x.id === op.id); const old = at < 0 ? null : list[at];
    if (canonicalSceneValue(old) !== canonicalSceneValue(op.before) || (op.after !== null && (!record(op.after) || op.after.id !== op.id))) throw Error('SCENE_STALE');
    const next = op.after as Record<string,unknown> | null;
    const affected = [old,next].filter((x): x is Record<string,unknown> => !!x);
    if (!byUser && affected.some(x => x.locked || [x.id,x.entityId,x.actorId,x.targetId,x.ownerId,x.wearerId].some(ownerLocked))) throw Error('SCENE_LOCKED');
    // Rebinding or replacing an identity is a user-reviewed operation, not a tag edit.
    if (!byUser && old && next && ['kind','entityId','ownerId','wearerId','actorId','targetId','subject'].some(k => old[k] !== next[k])) throw Error('SCENE_REBIND');
    if (at >= 0) { if (next) list[at] = JSON.parse(JSON.stringify(next)); else list.splice(at,1); }
    else if (next) list.push(JSON.parse(JSON.stringify(next)));
    else throw Error('SCENE_OPERATION');
  }
  s.revision += value.operations.length ? 1 : 0;
  const checked = readSceneBindings(s);
  if (!checked) throw Error('SCENE_INVALID');
  return checked;
}

export function compileSceneBindings(input: SceneBindings) {
  const scene = readSceneBindings(input);
  if (!scene) throw Error('SCENE_INVALID');
  const people = scene.entities.filter(e => e.kind === 'character');
  const facts = (id: string) => scene.facts.filter(f => f.entityId === id).map(f => f.prompt).filter(p => p.length > 0);
  const describe = (e: SceneEntity) => [e.prompt,...facts(e.id)].join(', ');
  const label = (id: string) => {
    const i = people.findIndex(e => e.id === id);
    return i >= 0 ? `character ${i + 1}` : describe(scene.entities.find(e => e.id === id)!);
  };
  const interaction = (r: SceneRelation) => `${label(r.actorId)}${r.actorPart ? ` (${r.actorPart})` : ''}: ${r.action} -> ${label(r.targetId)}${r.targetPart ? ` (${r.targetPart})` : ''}.`;
  const counts = ['boy','girl','other'].map(kind => {
    const n = people.filter(e => e.subject === kind).length;
    return n ? `${n}${kind}${n > 1 ? 's' : ''}` : '';
  }).filter(Boolean);
  const objects = scene.entities.filter(e => e.kind !== 'character' && !e.wearerId).map(e => `${describe(e)}${e.ownerId ? `, owned by ${label(e.ownerId)}` : ''}.`);
  return {
    positivePrompt: [...counts,...facts('scene'),...objects,...scene.relations.map(interaction)].join(', '),
    characterPrompts: people.map(e => ({
      prompt: [e.subject,e.prompt,...facts(e.id),...scene.entities.filter(g => g.wearerId === e.id).map(g => `Wearing ${describe(g)}.`),...scene.relations.filter(r => r.actorId === e.id || r.targetId === e.id).map(interaction)].filter(Boolean).join(', '),
      negativePrompt: '', useCoords: !!e.position, x: e.position?.x ?? .5, y: e.position?.y ?? .5,
    })),
  };
}

export const SCENE_BINDINGS_INSTRUCTION = `For a FIRST image with characters using a V4/V4.5/V5 model, return an application-owned scene object inside <langbai-image> instead of flattening character facts into positivePrompt.
scene={version:1,revision:0,entities:[{id:"person_a",kind:"character",name:"Person A",subject:"girl",prompt:"woman"},{id:"coat_a",kind:"garment",name:"A's coat",prompt:"coat",ownerId:"person_a",wearerId:"person_a"}],facts:[{id:"setting",entityId:"scene",slot:"setting",prompt:"city street"},{id:"coat_color",entityId:"coat_a",slot:"color",prompt:"red"},{id:"expression_a",entityId:"person_a",slot:"expression",prompt:"smile"}],relations:[]}.
For scenery without characters, use entities:[] and facts bound to entityId:"scene"; never add a person just to fit the schema.
Use stable, distinct IDs for every person, garment, prop, fact and interaction; never use chat-persona IDs. Names are display labels; prompt/action/body-part text is English. Facts belong to an entity and slot, clothing properties to a particular garment. Each character has subject boy/girl/other. Relations use {id,actorId,targetId,action,actorPart?,targetPart?}; ownership, wearing and holding are distinct. An optional character position is {x:0..1,y:0..1}. Do not invent explicit coordinates.
When the current state includes scene, modify ONLY with baseImageId and scenePatch:{revision:CURRENT_REVISION,operations:[{collection:"facts",id:"coat_color",before:EXACT_OLD_OBJECT,after:UPDATED_OBJECT}]}. Collection is entities/facts/relations. Add: before:null; delete:after:null. Keep IDs and unrelated facts byte-for-byte. One fact per entity+slot; change an existing slot instead of appending a contradictory duplicate. Never return full scene or promptPatch to replace an existing bound scene. Parameters-only edits use an empty operations array. Keep every unmentioned fact, even if not locked. Locked items and their descendants must remain unchanged. Ask a concise question when the target is ambiguous or a lock conflicts; do not generate then. Reassigning an owner or interaction endpoint requires user review. Older unstructured images continue using the literal promptPatch contract; never auto-convert them or drop unclassified tags. Never author stylePrompt or negativePrompt.`;
