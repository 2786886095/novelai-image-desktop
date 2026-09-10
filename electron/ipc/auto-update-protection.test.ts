import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ install: '', temp: '', data: {} as any, get: vi.fn(), spawn: vi.fn(), quit: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({app: {getPath: (key: string) => key === 'temp' ? state.temp : path.join(state.install, 'app.exe'), quit: state.quit}}));
vi.mock('./store', () => ({readStore: () => state.data}));
vi.mock('./proxy', () => ({proxyConfig: () => ({})}));
vi.mock('axios', () => ({default: {get: state.get}}));
vi.mock('child_process', () => ({spawn: state.spawn}));
vi.mock('./update', () => ({
  updateSourceOrder: () => ['github'],
  latestGithubRelease: async () => ({ version: '2.2.6', assets: [
    {name:'Langbai-NovelAI-Studio-Setup-2.2.6.exe', url:'https://github.com/test/setup.exe',size:4},
    {name:'latest.yml', url:'https://github.com/test/latest.yml'},
  ]}), latestGiteeRelease: vi.fn(),
}));
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-update-integration-'));
  state.install = path.join(root, 'installed'); state.temp = path.join(root, 'temp'); fs.mkdirSync(state.install); fs.mkdirSync(state.temp);
  state.data = {settings:{outputDir: path.join(root, 'Pictures')}, history:[]};
  vi.resetModules(); vi.clearAllMocks();
  state.get.mockImplementation(async (url: string) => url.endsWith('.yml')
    ? {data:`sha512: ${createHash('sha512').update('test').digest('base64')}`} : {data:Readable.from([Buffer.from('test')])});
  state.spawn.mockImplementation(() => Object.assign(new EventEmitter(), {unref:vi.fn()}));
});
afterEach(() => { vi.useRealTimers(); fs.rmSync(root, {recursive:true,force:true}); });
async function updater() {
  const api = await import('./auto-update');
  api.wireAutoUpdater(() => ({isDestroyed:()=>false, webContents:{isDestroyed:()=>false,send:state.send}} as any));
  return api;
}
describe.skipIf(process.platform !== 'win32')('in-app update protection wiring', () => {
  it('stops before downloads and never spawns/quits for unsafe output', async () => {
    state.data.settings.outputDir = path.join(state.install, 'custom-images');
    const api = await updater();
    expect(await api.downloadUpdate()).toMatchObject({ok:false,message:expect.stringContaining('更新已停止')});
    expect(state.get).not.toHaveBeenCalled(); expect(state.spawn).not.toHaveBeenCalled(); expect(state.quit).not.toHaveBeenCalled();
    expect(state.send).toHaveBeenLastCalledWith('app:updateEvent',expect.objectContaining({kind:'error'}));
  });
  it('rechecks a changed directory after the verified installer downloads', async () => {
    vi.useFakeTimers(); const api = await updater();
    expect(await api.downloadUpdate()).toMatchObject({ok:true});
    state.data.settings.outputDir = path.join(state.install, 'new-output');
    await vi.advanceTimersByTimeAsync(900);
    expect(state.spawn).not.toHaveBeenCalled(); expect(state.quit).not.toHaveBeenCalled();
    expect(state.send).toHaveBeenLastCalledWith('app:updateEvent',expect.objectContaining({kind:'error'}));
  });
  it('allows the existing silent-install arguments only for external data', async () => {
    vi.useFakeTimers(); const api = await updater();
    expect(await api.downloadUpdate()).toMatchObject({ok:true});
    await vi.advanceTimersByTimeAsync(900);
    expect(state.spawn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Setup-2.2.6.exe'),['--updated','/S','--force-run'],expect.objectContaining({windowsHide:true}));
    api.installUpdate(); expect(state.spawn).toHaveBeenCalledTimes(1);
  });
});
