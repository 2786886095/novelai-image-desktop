import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ install: '', temp: '', data: {} as any, get: vi.fn(), spawn: vi.fn(), quit: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({app: {getVersion:()=>'2.2.5',getPath: (key: string) => key === 'temp' ? state.temp : path.join(state.install, 'app.exe'), quit: state.quit}}));
vi.mock('./store', () => ({readStore: () => state.data}));
vi.mock('./proxy', () => ({proxyConfig: () => ({})}));
vi.mock('axios', () => ({default: {get: state.get}}));
vi.mock('child_process', () => ({spawn: state.spawn}));
vi.mock('./update', async (original) => ({
  ...await original<typeof import('./update')>(),
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
    ? {data:`version: 2.2.6\npath: Langbai-NovelAI-Studio-Setup-2.2.6.exe\nsha512: ${createHash('sha512').update('test').digest('base64')}`} : {data:Readable.from([Buffer.from('test')])});
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
  it('lets the verified new installer migrate the default Tavern directory without blocking the download', async () => {
    vi.useFakeTimers();
    const workspace=path.join(state.install,'LangbaiWorkspace');fs.mkdirSync(workspace);fs.writeFileSync(path.join(workspace,'agent-workspace.json'),'keep');
    const api=await updater();expect(await api.downloadUpdate()).toMatchObject({ok:true});await vi.advanceTimersByTimeAsync(900);
    await vi.waitFor(()=>expect(state.spawn).toHaveBeenCalledTimes(1));expect(fs.readFileSync(path.join(workspace,'agent-workspace.json'),'utf8')).toBe('keep');
  });
  it('installs silently without the assisted installer wizard', async () => {
    vi.useFakeTimers(); const api = await updater();
    expect(await api.downloadUpdate()).toMatchObject({ok:true});
    await vi.advanceTimersByTimeAsync(900);
    await vi.waitFor(()=>expect(state.spawn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Setup-2.2.6.exe'),['/S','--updated','--force-run'],expect.objectContaining({windowsHide:true})));
    api.installUpdate(); expect(state.spawn).toHaveBeenCalledTimes(1);
  });
});

it.skipIf(process.platform!=='win32')('waits for shutdown and quits only after the silent installer spawns',async()=>{
 vi.useFakeTimers();const api=await updater();let done!:()=>void;
 const prepare=vi.fn(()=>new Promise<void>(resolve=>{done=resolve;}));
 api.wireAutoUpdater(()=>null,prepare);await api.downloadUpdate();await vi.advanceTimersByTimeAsync(900);
 await vi.waitFor(()=>expect(prepare).toHaveBeenCalledTimes(1));expect(state.spawn).not.toHaveBeenCalled();
 done();await vi.waitFor(()=>expect(state.spawn).toHaveBeenCalledTimes(1));expect(state.quit).not.toHaveBeenCalled();
 state.spawn.mock.results[0].value.emit('spawn');await vi.advanceTimersByTimeAsync(450);expect(state.quit).toHaveBeenCalledTimes(1);
});
it.skipIf(process.platform!=='win32')('leaves the app open and allows retry if process launch throws',async()=>{
 vi.useFakeTimers();const api=await updater();state.spawn.mockImplementationOnce(()=>{throw Error('launch failed');});
 await api.downloadUpdate();await vi.advanceTimersByTimeAsync(900);
 expect(state.quit).not.toHaveBeenCalled();await vi.waitFor(()=>expect(state.send).toHaveBeenLastCalledWith('app:updateEvent',expect.objectContaining({kind:'error'})));
 await api.installUpdate();expect(state.spawn).toHaveBeenCalledTimes(2);
});
it.skipIf(process.platform!=='win32')('never starts an installer if graceful shutdown fails',async()=>{
 vi.useFakeTimers();const api=await updater();api.wireAutoUpdater(()=>null,async()=>{throw Error('shutdown failed');});
 await api.downloadUpdate();await api.installUpdate();expect(state.spawn).not.toHaveBeenCalled();expect(state.quit).not.toHaveBeenCalled();
});

it.skipIf(process.platform!=='win32')('rejects an installer changed after successful download',async()=>{
 vi.useFakeTimers();const api=await updater();await api.downloadUpdate();
 fs.writeFileSync(path.join(state.temp,'langbai-novelai-update','2.2.6','Langbai-NovelAI-Studio-Setup-2.2.6.exe'),'evil');
 await vi.advanceTimersByTimeAsync(900);expect(state.spawn).not.toHaveBeenCalled();expect(state.quit).not.toHaveBeenCalled();
 await vi.waitFor(()=>expect(state.send).toHaveBeenLastCalledWith('app:updateEvent',expect.objectContaining({kind:'error',message:expect.stringContaining('发生变化')})));
});
it.skipIf(process.platform!=='win32')('pins the adapter plan and keeps UI update out until acknowledged handoff',async()=>{
 vi.useFakeTimers();const api=await updater(),adapter=api.desktopAppUpdateAdapter(()=>{}),signal=new AbortController().signal;
 const plan=await adapter.plan(signal);expect(plan?.version).toBe('2.2.6');expect(state.get).toHaveBeenCalledTimes(1);
 adapter.reserve();expect((await api.downloadUpdate()).ok).toBe(false);await expect(api.installUpdate()).rejects.toThrow('独占');
 await adapter.download(plan!,signal,()=>{});await vi.advanceTimersByTimeAsync(1000);expect(state.spawn).not.toHaveBeenCalled();
 const started=vi.fn(async()=>{});const launched=adapter.install(plan!,signal,started);
 await vi.waitFor(()=>expect(state.spawn).toHaveBeenCalledTimes(1));expect(started).not.toHaveBeenCalled();
 state.spawn.mock.results[0].value.emit('spawn');await launched;expect(started).toHaveBeenCalledTimes(1);adapter.release();
 await vi.advanceTimersByTimeAsync(450);expect(state.quit).toHaveBeenCalledTimes(1);
});
it.skipIf(process.platform!=='win32')('aborted plan download cannot launch or schedule installation',async()=>{
 const api=await updater(),adapter=api.desktopAppUpdateAdapter(()=>{}),controller=new AbortController();const plan=await adapter.plan(controller.signal);
 adapter.reserve();controller.abort();await expect(adapter.download(plan!,controller.signal,()=>{})).rejects.toThrow();adapter.release();
 expect(state.spawn).not.toHaveBeenCalled();expect(state.get).toHaveBeenCalledTimes(1);
});
it.skipIf(process.platform!=='win32')('installer cancellation during shutdown retains the app and restores exit guarding',async()=>{
 const api=await updater(),adapter=api.desktopAppUpdateAdapter(()=>{}),controller=new AbortController(),failed=vi.fn();
 const plan=await adapter.plan(controller.signal);adapter.reserve();await adapter.download(plan!,controller.signal,()=>{});
 api.wireAutoUpdater(()=>null,async()=>{controller.abort();},failed);
 await expect(adapter.install(plan!,controller.signal,async()=>{})).rejects.toThrow();adapter.release();
 await api.installUpdate(); // A stale UI install action cannot reuse the cancelled download.
 expect(failed).toHaveBeenCalledTimes(1);expect(state.spawn).not.toHaveBeenCalled();expect(state.quit).not.toHaveBeenCalled();
});
it.skipIf(process.platform!=='win32')('a receipt failure after spawn never allows a duplicate installer',async()=>{
 const api=await updater(),adapter=api.desktopAppUpdateAdapter(()=>{}),signal=new AbortController().signal;
 const plan=await adapter.plan(signal);adapter.reserve();await adapter.download(plan!,signal,()=>{});
 const failed=expect(adapter.install(plan!,signal,async()=>{throw Error('receipt disk full');})).rejects.toThrow('receipt disk full');
 await vi.waitFor(()=>expect(state.spawn).toHaveBeenCalledTimes(1));state.spawn.mock.results[0].value.emit('spawn');await failed;adapter.release();
 expect(api.appUpdateBusy()).toBe(true);expect((await api.downloadUpdate()).ok).toBe(false);expect(state.spawn).toHaveBeenCalledTimes(1);
});
it.skipIf(process.platform!=='win32')('mismatched release manifests stop before downloading an executable',async()=>{
 const api=await updater();state.get.mockResolvedValueOnce({data:`version: 2.2.7\npath: other.exe\nsha512: ${createHash('sha512').update('test').digest('base64')}`});
 await expect(api.planAppUpdate()).rejects.toThrow('不一致');expect(state.get).toHaveBeenCalledTimes(1);expect(state.spawn).not.toHaveBeenCalled();
});
