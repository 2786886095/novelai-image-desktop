import {afterEach, describe, expect, it, vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import {imageStageContainsPoint, imageStageNavigation} from './image-stage-navigation';

afterEach(() => vi.unstubAllGlobals());
const history = [
  {id: 'newest', filePath: 'F:/materials/newest.png'},
  {id: 'material', filePath: 'F:/materials/middle.png'},
  {id: 'oldest', filePath: 'F:/materials/oldest.png'},
];

describe('the actual History & Materials navigation helper', () => {
  it('keeps the supplied order, respects boundaries and does not wrap', () => {
    expect(imageStageNavigation(history, history[0])).toEqual({index: 0, previous: undefined, next: history[1]});
    expect(imageStageNavigation(history, history[2])).toEqual({index: 2, previous: history[1], next: undefined});
  });
  it('resolves an id-less loaded workbench image by normalized Windows filePath', () => {
    expect(imageStageNavigation(history, {filePath: 'f:\\MATERIALS\\middle.png'})).toEqual({index: 1, previous: history[0], next: history[2]});
    expect(imageStageNavigation(history, {id: 'temporary', filePath: history[1].filePath}).index).toBe(1);
    expect(imageStageNavigation([{filePath: '\\\\HOST\\Share\\A.png'}], {filePath: '//host/share/a.png'}).index).toBe(0);
  });
  it('prefers a durable id, never invents a selection for missing/external/stale inputs', () => {
    expect(imageStageNavigation(history, {id: 'oldest', filePath: history[0].filePath}).index).toBe(2);
    for (const input of [{}, {filePath: 'F:/external.png'}, {id: 'missing'}]) {
      expect(imageStageNavigation(history, input)).toEqual({index: -1, previous: undefined, next: undefined});
    }
    expect(imageStageNavigation([], history[1]).index).toBe(-1);
    expect(imageStageNavigation([history[0], history[2]], history[1]).index).toBe(-1);
    expect(imageStageNavigation([history[2], history[0]], history[0]).previous).toBe(history[2]);
  });
  it('does not conflate case-sensitive POSIX filenames', () => {
    expect(imageStageNavigation([{filePath: '/images/A.png'}], {filePath: '/images/a.png'}).index).toBe(-1);
  });
});

describe('transformed image coordinates, including object-fit letterboxing', () => {
  function picture(bounds: {left: number; top: number; width: number; height: number}, naturalWidth = 100, naturalHeight = 400) {
    return {getBoundingClientRect: () => bounds, naturalWidth, naturalHeight} as HTMLImageElement;
  }
  it('rejects letterbox pixels inside the img box and accepts the visible image edges', () => {
    vi.stubGlobal('getComputedStyle', () => ({objectFit: 'contain'}));
    const image = picture({left: 100, top: 20, width: 400, height: 400});
    expect(imageStageContainsPoint(image, 101, 220)).toBe(false);
    expect(imageStageContainsPoint(image, 499, 220)).toBe(false);
    expect(imageStageContainsPoint(image, 250, 20)).toBe(true);
    expect(imageStageContainsPoint(image, 350, 420)).toBe(true);
    expect(imageStageContainsPoint(image, 300, 421)).toBe(false);
    const wide = picture({left: 10, top: 10, width: 400, height: 400}, 400, 100);
    expect(imageStageContainsPoint(wide, 210, 20)).toBe(false);
    expect(imageStageContainsPoint(wide, 210, 210)).toBe(true);
  });
  it('uses the live zoom/pan DOM bounds, not untransformed offsets or metadata', () => {
    vi.stubGlobal('getComputedStyle', () => ({objectFit: 'contain'}));
    const image = picture({left: -60, top: -80, width: 200, height: 800});
    expect(imageStageContainsPoint(image, 100, 200)).toBe(true);
    expect(imageStageContainsPoint(image, 141, 200)).toBe(false);
    expect(imageStageContainsPoint(null, 100, 200)).toBe(false);
    expect(imageStageContainsPoint(picture({left: 0, top: 0, width: 0, height: 0}), 0, 0)).toBe(false);
    expect(imageStageContainsPoint(picture({left: 0, top: 0, width: 100, height: 100}, 0, 0), 50, 50)).toBe(false);
  });
});

it('executes the actual stage keys, coordinate click handler, reset effect and viewer props', () => {
  const result = spawnSync(process.execPath, ['tests/history-stage-probe.cjs', 'src/App.tsx'], {encoding: 'utf8'});
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({keySelection: ['material-2'], blankClickOpened: false, imageClickOpened: true, viewerImages: 3, viewerIndex: 1, staysOpenOnImageChange: true});
});
