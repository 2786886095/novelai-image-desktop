import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useAppStore} from './store';
import {normalizeHistoryWidth, readHistoryCollapsed, historyRailText} from './workspace-history';

const saved = new Map<string, string>();
beforeEach(() => {
  saved.clear();
  vi.stubGlobal('localStorage', {getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k,v)});
  useAppStore.setState(useAppStore.getInitialState(),true);
});
afterEach(() => { vi.unstubAllGlobals(); useAppStore.setState(useAppStore.getInitialState(),true); });

it('button collapse remembers the expanded width and persists both values', () => {
  const s=useAppStore.getState();s.setWsWidth('right',426);s.setWsHistoryCollapsed(true);
  expect(useAppStore.getState()).toMatchObject({wsRightWidth:426,wsHistoryCollapsed:true,wsHistoryDragWidth:null});
  expect(saved.get('langbai.ws.right')).toBe('426');expect(readHistoryCollapsed()).toBe(true);
  s.setWsHistoryCollapsed(false);expect(useAppStore.getState().wsRightWidth).toBe(426);expect(readHistoryCollapsed()).toBe(false);
});
it('drag can reach zero, remembering expanded width, and partially reveal without saving', () => {
  const s=useAppStore.getState();s.setWsWidth('right',390);s.setWsHistoryDragWidth(0);s.commitWsHistoryDragWidth();
  expect(useAppStore.getState()).toMatchObject({wsRightWidth:390,wsHistoryCollapsed:true});
  s.setWsHistoryDragWidth(120);
  expect(useAppStore.getState()).toMatchObject({wsHistoryDragWidth:120,wsRightWidth:390,wsHistoryCollapsed:true});
  expect(saved.get('langbai.ws.history-collapsed')).toBe('true');
  s.commitWsHistoryDragWidth();expect(useAppStore.getState()).toMatchObject({wsRightWidth:220,wsHistoryCollapsed:false,wsHistoryDragWidth:null});
});
it('cancelled drag restores layout without overwriting remembered state', () => {
  const s=useAppStore.getState();s.setWsWidth('right',415);s.setWsHistoryCollapsed(false);s.setWsHistoryDragWidth(25);s.setWsHistoryDragWidth(null);
  expect(useAppStore.getState()).toMatchObject({wsRightWidth:415,wsHistoryCollapsed:false,wsHistoryDragWidth:null});
  expect(saved.get('langbai.ws.right')).toBe('415');
});
it('threshold, bounded width, malformed values and reset are deterministic', () => {
  const s=useAppStore.getState();s.setWsHistoryDragWidth(72);s.commitWsHistoryDragWidth();expect(useAppStore.getState().wsHistoryCollapsed).toBe(true);
  s.setWsHistoryDragWidth(73);s.commitWsHistoryDragWidth();expect(useAppStore.getState().wsHistoryCollapsed).toBe(false);
  s.setWsHistoryDragWidth(900);s.commitWsHistoryDragWidth();expect(useAppStore.getState().wsRightWidth).toBe(480);
  s.setWsHistoryDragWidth(NaN);expect(useAppStore.getState().wsHistoryDragWidth).toBe(null);
  s.setWsHistoryCollapsed(true);s.resetWsWidths();expect(useAppStore.getState()).toMatchObject({wsRightWidth:340,wsHistoryCollapsed:false});
  expect(saved.get('langbai.ws.history-collapsed')).toBe('false');
  expect([0,NaN,Infinity].map(normalizeHistoryWidth)).toEqual([340,340,340]);expect(normalizeHistoryWidth(1)).toBe(220);
});
it('storage failure does not break the UI, and legacy state defaults to expanded', () => {
  expect(readHistoryCollapsed()).toBe(false);
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('unavailable');},setItem:()=>{throw Error('quota');}});
  expect(readHistoryCollapsed()).toBe(false);expect(()=>useAppStore.getState().setWsHistoryCollapsed(true)).not.toThrow();
});
it('collapse does not change selected image, filters, prompts or generation state', () => {
  useAppStore.setState({selectedDate:'2026-10-06',selectedGroupId:'fixture',isGenerating:true});
  const before=useAppStore.getState();before.setWsHistoryCollapsed(true);const after=useAppStore.getState();
  for (const key of ['history','currentImage','params','selectedDate','selectedGroupId','isGenerating'] as const) expect(after[key]).toBe(before[key]);
});
it('five UI languages expose nonempty, distinct collapse and restore labels', () => {
  for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){const t=historyRailText(language);expect(t.show).not.toBe(t.hide);expect(t.resize).toBeTruthy();}
});
