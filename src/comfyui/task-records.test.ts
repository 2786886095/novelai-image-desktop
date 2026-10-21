import { describe, expect, it } from 'vitest';
import type { ComfyResultItem, ComfyRunSnapshot } from './contract';
import { comfyTaskFacts } from './task-records';

const start = '2026-10-21T00:00:00.000Z';
const end = '2026-10-21T00:01:15.900Z';
const image = (overrides: Partial<ComfyResultItem> = {}): ComfyResultItem => ({
  id: 'image-1', runId: 'run-1', workflowId: 'workflow-1', promptId: 'prompt-1',
  filePath: 'C:\\Synthetic\\red-cup.png', fileUrl: 'nai-local://synthetic/red-cup', mime: 'image/png',
  width: 512, height: 768, bytes: 1234, sha256: 'a'.repeat(64), sourceNodeId: '8', createdAt: end,
  slotValues: { 'positive:6:text': 'A red ceramic cup.', 'negative:7:text': 'blurry', 'width:5:width': 1024, 'seed:3:seed': 123 },
  ...overrides,
});
const run = (overrides: Partial<ComfyRunSnapshot> = {}): ComfyRunSnapshot => ({
  runId: 'run-1', workflowId: 'workflow-1', promptId: 'prompt-1', phase: 'completed', queuePosition: null,
  currentNode: null, progress: null, nodesExecuted: 8, nodesTotal: 8, startedAt: start, finishedAt: end,
  seeds: { 'seed:3:seed': 123 }, error: null, results: [image()], nonImageOutputs: 0, ...overrides,
});
const corrupt = (values: Record<string, unknown>): ComfyRunSnapshot => values as unknown as ComfyRunSnapshot;
const damagedImage = (values: Record<string, unknown>): ComfyResultItem => ({ ...image(), ...values }) as ComfyResultItem;

describe('Comfy task receipt facts', () => {
  it('joins real indexed images by both receipt identities and preserves index order', () => {
    const second = image({ id: 'image-2', width: 768, height: 512 });
    const result = comfyTaskFacts(run(), [image({ workflowId: 'another' }), image({ runId: 'another' }), second, image(), second]);
    expect(result.images.map(item => item.id)).toEqual(['image-2', 'image-1']);
    expect(result.firstImage).toBe(second);
  });
  it('does not match empty or missing identities', () => {
    expect(comfyTaskFacts(run({ runId: '' }), [image({ runId: '' })]).images).toEqual([]);
    expect(comfyTaskFacts(corrupt({}), [image()]).firstImage).toBeNull();
  });
  it('only uses indexed local still-image records for thumbnails', () => {
    const bad = [null, {}, image({ fileUrl: 'https://example.invalid/picture.png' }), image({ fileUrl: 'file:///synthetic.png' }), image({ fileUrl: 'javascript:alert(1)' }), image({ fileUrl: '' }), image({ filePath: '' }), damagedImage({ mime: 'video/mp4' })];
    expect(comfyTaskFacts(run(), bad as ComfyResultItem[]).images).toEqual([]);
    expect(comfyTaskFacts(run(), undefined as unknown as ComfyResultItem[]).images).toEqual([]);
    expect(comfyTaskFacts(run(), []).firstImage).toBeNull();
  });
  it('allows strict synthetic image data URLs without synthesizing filesystem URL fallbacks', () => {
    const synthetic = image({ fileUrl: 'data:image/png;base64,AQ==' });
    expect(comfyTaskFacts(run(), [synthetic]).firstImage).toBe(synthetic);
    for (const fileUrl of ['data:image/svg+xml;base64,AQ==', 'data:text/html;base64,AQ==', 'data:image/png;base64,', 'data:image/png;base64,not base64', 'data:image/png;base64,A']) {
      expect(comfyTaskFacts(run(), [image({ fileUrl })]).firstImage).toBeNull();
    }
  });
  it('does not use a run embedded image as an indexed reuse or thumbnail record', () => {
    const facts = comfyTaskFacts(run(), []);
    expect(facts.imageCount).toBe(1);
    expect(facts.images).toEqual([]);
    expect(facts.recordedValues).toBeNull();
    expect(facts.prompt).toBe('');
  });
  it('keeps saved receipt counts when thumbnail URLs fail or the index has fewer images', () => {
    const current = run({ results: [image(), image({ id: 'image-2', fileUrl: '' })] });
    expect(comfyTaskFacts(current, [image({ fileUrl: '' })]).imageCount).toBe(2);
    expect(comfyTaskFacts(run({ history: { restored: true, status: 'recorded', resultCount: 57 }, results: [] }), [image()]).imageCount).toBe(57);
    expect(comfyTaskFacts(run({ history: { restored: true, status: 'recorded', resultCount: 0 } }), [image()]).imageCount).toBe(0);
  });
  it.each([undefined, null, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2'])('keeps unknown or corrupt history count %s unknown', count => {
    const current = corrupt({ ...run(), history: { restored: true, status: 'unknown', resultCount: count } });
    expect(comfyTaskFacts(current, [image()]).imageCount).toBeNull();
  });
  it('guards corrupt live receipts and does not count unrelated or non-image entries', () => {
    expect(comfyTaskFacts(corrupt({ ...run(), results: null }), [image()]).imageCount).toBeNull();
    expect(comfyTaskFacts(corrupt({ ...run(), results: [null, {}, image(), image({ runId: 'other' }), damagedImage({ mime: 'video/mp4' })] }), []).imageCount).toBe(1);
    expect(comfyTaskFacts(run({ results: [], nonImageOutputs: 3 }), []).imageCount).toBe(0);
  });
  it('reports submitted-to-finished total elapsed time including queue time', () => {
    expect(comfyTaskFacts(run(), [], Date.parse(end) + 999999)).toMatchObject({ startedMs: Date.parse(start), finishedMs: Date.parse(end), elapsedSeconds: 75, liveElapsed: false });
    expect(comfyTaskFacts(run({ finishedAt: start }), []).elapsedSeconds).toBe(0);
  });
  it.each(['validating', 'submitting', 'queued', 'running', 'saving', 'cancelling'] as const)('only current active %s can show an advancing elapsed time', phase => {
    expect(comfyTaskFacts(run({ phase, finishedAt: null }), [], Date.parse(start) + 12345)).toMatchObject({ elapsedSeconds: 12, liveElapsed: true, finishedMs: null });
  });
  it.each(['completed', 'failed', 'cancelled', 'invented'] as const)('does not invent an end time for a terminal or unknown %s phase', phase => {
    const current = corrupt({ ...run(), phase, finishedAt: null });
    expect(comfyTaskFacts(current, [], Date.parse(end))).toMatchObject({ elapsedSeconds: null, liveElapsed: false });
  });
  it('never advances restored history or uses now when its finish time is missing', () => {
    for (const history of [{ restored: true, status: 'unknown' }, { restored: true, status: 'recorded', resultCount: 1 }, null, true]) {
      expect(comfyTaskFacts(corrupt({ ...run({ phase: 'running', finishedAt: null }), history }), [], Date.parse(end))).toMatchObject({ elapsedSeconds: null, liveElapsed: false });
    }
    expect(comfyTaskFacts(run({ history: { restored: true, status: 'recorded', resultCount: 1 } }), []).elapsedSeconds).toBe(75);
  });
  it.each([
    { startedAt: 'bad' }, { startedAt: null }, { finishedAt: 'bad' }, { finishedAt: '' },
    { finishedAt: '2026-10-20T23:59:59Z' },
  ])('does not invent elapsed duration for invalid or reversed timestamps %j', overrides => {
    expect(comfyTaskFacts(corrupt({ ...run({ phase: 'running' }), ...overrides }), [], Date.parse(end))).toMatchObject({ elapsedSeconds: null, liveElapsed: false });
  });
  it.each([NaN, Infinity, Date.parse(start) - 1])('does not use invalid or backwards now %s', now => {
    expect(comfyTaskFacts(run({ phase: 'queued', finishedAt: null }), [], now)).toMatchObject({ elapsedSeconds: null, liveElapsed: false });
  });
  it('returns only actually recorded safe seed values, including zero', () => {
    const current = corrupt({ ...run(), seeds: { zero: 0, max: Number.MAX_SAFE_INTEGER, negative: -1, fraction: 1.5, overflow: Number.MAX_SAFE_INTEGER + 1, nan: NaN, inf: Infinity, string: '123', '': 1 } });
    expect(comfyTaskFacts(current, [image()]).seeds).toEqual([{ id: 'zero', value: 0 }, { id: 'max', value: Number.MAX_SAFE_INTEGER }]);
    expect(comfyTaskFacts(run({ seeds: {} }), [image()]).seeds).toEqual([]);
    expect(comfyTaskFacts(corrupt({ ...run(), seeds: null }), []).seeds).toEqual([]);
    expect(comfyTaskFacts(corrupt({ ...run(), seeds: [12] }), []).seeds).toEqual([]);
  });
  it('derives positive prompts and copied values only from the first actual associated image', () => {
    const actual = image({ slotValues: { 'positive:1:text': 'Red cup', 'prompt:2:text': 'Blue table', 'negative:3:text': 'blurry', 'positive:4:text': true, 'width:5:width': 1024, enabled: false } });
    const facts = comfyTaskFacts(run(), [image({ workflowId: 'other', slotValues: { 'positive:1:text': 'Wrong workflow' } }), actual]);
    expect(facts.prompt).toBe('Red cup · Blue table');
    expect(facts.recordedValues).toEqual(actual.slotValues);
    expect(facts.recordedValues).not.toBe(actual.slotValues);
    expect(facts.seeds).toEqual([{ id: 'seed:3:seed', value: 123 }]);
  });
  it.each([undefined, null, [], { 'positive:1:text': 'text', broken: {} }, { x: Infinity }, { x: NaN }])('does not partially trust corrupt saved slot maps %j', values => {
    const facts = comfyTaskFacts(run(), [damagedImage({ slotValues: values }), image({ id: 'image-2' })]);
    expect(facts.recordedValues).toBeNull();
    expect(facts.prompt).toBe('');
  });
  it('distinguishes an actually recorded empty parameter map from a missing record', () => {
    expect(comfyTaskFacts(run(), [image({ slotValues: {} })]).recordedValues).toEqual({});
    expect(comfyTaskFacts(run(), []).recordedValues).toBeNull();
  });
  it('copies dangerous-looking own slot keys as data without modifying object prototypes', () => {
    const slots = JSON.parse('{"__proto__":"saved scalar","positive:1:text":"Cup"}');
    const values = comfyTaskFacts(run(), [image({ slotValues: slots })]).recordedValues!;
    expect(Object.hasOwn(values, '__proto__')).toBe(true);
    expect(values['__proto__']).toBe('saved scalar');
    expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
  });
  it('deduplicates actual positive-integer output dimensions without inferring input size', () => {
    const actual = [image(), image({ id: '2' }), image({ id: '3', width: 768, height: 512 }), image({ id: '4', width: 0 }), image({ id: '5', width: 1.5 }), image({ id: '6', height: Infinity }), damagedImage({ id: '7', width: '1024' })];
    expect(comfyTaskFacts(run(), actual).dimensions).toEqual([{ width: 512, height: 768 }, { width: 768, height: 512 }]);
    expect(comfyTaskFacts(run(), []).dimensions).toEqual([]);
  });
  it('does not mutate receipts or the separate result index', () => {
    const current = run(), results = [image()];
    const before = JSON.stringify({ current, results });
    comfyTaskFacts(current, results, Date.parse(end));
    expect(JSON.stringify({ current, results })).toBe(before);
  });
});
