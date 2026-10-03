import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import {normalizeV45ArtistSyntax, repairV45ArtistCandidatesForV5, drawAllV5ArtistWeights} from './v5-artist-weight-repair';
import {formatArtistCardTags} from './artist-recipe';

const fixture = '1.2::artist:qa_artist::,1.5::masterpiece::,night';
const source = fs.readFileSync(path.join(process.env.ARTIST_TRANSACTION_TARGET || process.cwd(), 'src/V5ArtistWeightRepair.tsx'), 'utf8');
const ast = ts.createSourceFile('V5ArtistWeightRepair.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['clearTemporaryResults','installCandidates','repair','draw','generateBatch']);
const declarations: string[] = [];
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.has(node.name.text)) declarations.push(`const ${node.getText(ast)};`);
  ts.forEachChild(node, visit);
}
visit(ast);
expect(declarations.length).toBe(names.size);
function runtime() {
  const ctx: any = {
    input: fixture, drawSource: fixture, results: [], batchReady: false,
    candidateCount: 8, seed: 20261002, seedMode: 'fixed', generationParams: {model: 'nai-diffusion-5-full'},
    weightControlMode: 'novice', minWeight: .2, maxWeight: 1.2, Math,
    basePrompt: 'landscape, lake, no humans', cancelRef: {current: false},
    text: {empty:'empty',none:'invalid',drawEmpty:'empty',drawNone:'invalid',needDraw:'prepare first',needPrompt:'prompt',complete:'complete',allTags:'valid',adjusted:'valid'},
    normalizeV45ArtistSyntax, repairV45ArtistCandidatesForV5, drawAllV5ArtistWeights, formatArtistCardTags,
    DEFAULT_V5_ARTIST_DRAW_MIN: .2, DEFAULT_V5_ARTIST_DRAW_MAX: 1.2,
    freshSeed: () => 20261002, clampNumber: (v:number,f:number,min:number,max:number) => Math.min(max,Math.max(min,v || f)),
    interpolate: (s:string) => s, refreshAccount: async () => {}, calls: [] as string[],
    window: {naiDesktop: {artistLabDeleteTemporary: async () => { throw new Error('unexpected delete'); }}},
  };
  for (const [setter, field] of [['setResults','results'],['setBatchReady','batchReady'],['setMessage','message'],['setOutput','output'],['setCopiedAction','copied'],['setShowFavorites','showFavorites'],['setRunning','running']]) ctx[setter] = (v:any) => {ctx[field] = v;};
  ctx.generateOne = async (item:any) => {ctx.calls.push(item.prompt);};
  vm.createContext(ctx);
  const js = ts.transpileModule(declarations.join('\n')+'\nglobalThis.actions = {repair, draw, generateBatch};', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext(js,ctx);
  return ctx;
}

describe('actual production candidate preparation and batch entry handlers', () => {
  for (const mode of ['repair','draw']) for (const invalid of ['', '::,,::']) {
    it(`${mode}: failed prepare ${JSON.stringify(invalid)} blocks stale batch and recovers`, async () => {
      const c=runtime(); c.actions[mode](); expect(c.results).toHaveLength(8);
      const old=c.results; const saved={id:'saved',image:{filePath:'fixture-kept.png'},liked:true}; old[0]=saved;
      c[mode==='repair'?'input':'drawSource']=invalid; c.actions[mode]();
      expect(c.results).toBe(old); expect(c.results[0]).toBe(saved);
      await c.actions.generateBatch();
      expect(c.calls, 'failed preparation must not invoke even one generation').toHaveLength(0);
      expect(c.message).toBe('prepare first');
      c[mode==='repair'?'input':'drawSource']=fixture; c.actions[mode]();
      await c.actions.generateBatch(); expect(c.calls).toHaveLength(8);
      console.log(JSON.stringify({mode,invalid,oldCandidatesRetained:8,favoritesKept:true,blockedGenerationCalls:0,recoveredGenerationCalls:8,network:false}));
    });
  }
});
