import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import {describe, it, expect} from 'vitest';
import {assertDesktopMetadataGates, metadataGateName} from '../scripts/image-metadata-release-contract.mjs';

const desktop = () => ({jobs: ['windows', 'macos'].map(platform => ({name: `build (${platform})`,
  conclusion: 'success', steps: [{name: metadataGateName, conclusion: 'success'}]}))});
describe('metadata publication checks (synthetic CI records, not device acceptance)', () => {
  it('requires both named desktop metadata gates', () => {
    expect(() => assertDesktopMetadataGates(desktop())).not.toThrow();
  });
  for (const status of ['skipped', 'failure', 'cancelled', 'neutral']) it(`desktop rejects ${status}`, () => {
    const report = desktop();
    report.jobs[0].steps[0].conclusion = status;
    expect(() => assertDesktopMetadataGates(report)).toThrow();
  });
  it('desktop rejects a green build without the metadata step', () => {
    const report = desktop(); report.jobs[0].steps = [];
    expect(() => assertDesktopMetadataGates(report)).toThrow();
  });
  it('desktop rejects missing and duplicate platforms', () => {
    const report = desktop(); report.jobs.pop(); expect(() => assertDesktopMetadataGates(report)).toThrow();
    report.jobs.push(report.jobs[0]); expect(() => assertDesktopMetadataGates(report)).toThrow();
  });
  it('desktop rejects an extra build for a removed platform', () => {
    const report = desktop(); report.jobs.push({...report.jobs[0], name: 'build (linux)'});
    expect(() => assertDesktopMetadataGates(report)).toThrow();
  });
});

it('keeps all 24 official format fixture bytes and metadata expectations intact', () => {
  const root = path.resolve('shared/official-image-metadata-fixtures');
  const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  expect(fixtures).toHaveLength(24); expect(new Set(fixtures.map((f: any) => f.name)).size).toBe(24);
  expect(fixtures.filter((f: any) => f.name.endsWith('.png'))).toHaveLength(18);
  expect(fixtures.filter((f: any) => f.name.endsWith('.webp'))).toHaveLength(6);
  for (const fixture of fixtures) {
    const bytes = fs.readFileSync(path.join(root, fixture.name));
    expect(bytes.length).toBe(fixture.bytes);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
    expect(Object.keys(fixture.expected).sort()).toEqual(['characters','model','negativePrompt','positivePrompt','seed','steps']);
  }
});

// Structural protection complements runtime tests; it is not an end-to-end UI claim.
it.each([
  ['src/App.tsx', 'parseImageMetaAsync'], ['src/MetadataInspector.tsx', 'readImageMetadataForRecovery'],
  ['src/works-library.ts', 'parseImageMetaAsync'], ['src/components/InpaintPromptSource.tsx', 'parseImageMetaAsync'],
  ['electron/ipc/agent-tools.ts', 'readNativeImageMetadata']
])('keeps %s on the awaited shared decoder', (file, symbol) => {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let calls = 0;
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === symbol) {
      calls++; expect(ts.isAwaitExpression(node.parent)).toBe(true);
    }
    if (ts.isCallExpression(node)) expect(node.expression.getText(source)).not.toBe('parseImageMeta');
    ts.forEachChild(node, walk);
  }
  walk(source); expect(calls).toBeGreaterThan(0);
});
