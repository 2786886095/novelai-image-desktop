import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({language:'zh-CN',theme:'light',systemDark:false,shownDark:false,busy:true,stop:vi.fn(async()=>{}),show:vi.fn(),handlers:new Map<string,Function>()}));
vi.mock('./harness-exit-dialog',()=>({showCenteredExitConfirmation:(_owner:unknown,options:unknown,dark:boolean)=>{mock.shownDark=dark;return mock.show(options);}}));
vi.mock('./store',()=>({getSetting:(key:string)=>key==='theme'?mock.theme:mock.language,getSettings:()=>({}),setSetting:vi.fn()}));
vi.mock('electron',()=>({nativeTheme:{get shouldUseDarkColors(){return mock.systemDark;}},app:{once:vi.fn(),getPath:()=>'/tmp/studio-test',getAppPath:()=>'/tmp/studio-test',isPackaged:false},dialog:{showMessageBox:mock.show},shell:{openExternal:vi.fn()},ipcMain:{handle:(key:string,fn:Function)=>mock.handlers.set(key,fn)}}));
vi.mock('./harness-engine',()=>({HarnessEngine:class{get busy(){return mock.busy;}stop=mock.stop;checkUpdates=vi.fn(async()=>{});snapshot=()=>({phase:'running'});}}));
vi.mock('./agent-tools',()=>({AGENT_TOOL_NAMES:[],executeAgentTool:vi.fn()}));
beforeEach(()=>{vi.resetModules();mock.busy=true;mock.stop.mockClear();mock.show.mockReset();mock.handlers.clear();});
describe('Native close confirmation',()=>{
  it('localizes native close buttons in all five languages without stopping on cancel',async()=>{
    const m=await import('./harness-launcher');m.registerHarnessLauncher(()=>null);mock.show.mockResolvedValue({response:0});
    for(const [language,cancel] of [['zh-CN','取消退出'],['zh-TW','取消結束'],['en-US','Cancel exit'],['ja-JP','終了をキャンセル'],['ko-KR','종료 취소']]){mock.language=language;expect(await m.confirmHarnessExit(null)).toBe(false);expect(mock.show.mock.calls.at(-1)?.[0].buttons[0]).toBe(cancel);}
    expect(mock.stop).not.toHaveBeenCalled();mock.language='zh-CN';
  });
  it('cancelling leaves the engine alive',async()=>{
    const m=await import('./harness-launcher');m.registerHarnessLauncher(()=>null);mock.show.mockResolvedValue({response:0});
    expect(await m.confirmHarnessExit(null)).toBe(false);expect(mock.stop).not.toHaveBeenCalled();expect(m.harnessNeedsExitConfirmation()).toBe(true);
  });
  it('confirmation stops the engine before allowing exit',async()=>{
    const m=await import('./harness-launcher');m.registerHarnessLauncher(()=>null);mock.show.mockResolvedValue({response:1});
    expect(await m.confirmHarnessExit(null)).toBe(true);expect(mock.stop).toHaveBeenCalledTimes(1);expect(m.harnessNeedsExitConfirmation()).toBe(false);
  });
  it('does not show repeated dialogs for close and quit together',async()=>{
    const m=await import('./harness-launcher');m.registerHarnessLauncher(()=>null);mock.show.mockResolvedValue({response:0});
    await Promise.all([m.confirmHarnessExit(null),m.confirmHarnessExit(null)]);expect(mock.show).toHaveBeenCalledTimes(1);
  });
  it('rejects control from a different renderer',async()=>{
    const m=await import('./harness-launcher');m.registerHarnessLauncher(()=>null);
    await expect(mock.handlers.get('harness:start')!({sender:{}})).rejects.toThrow('Unknown launcher sender');
  });
});

it('stops the agent for an authorized update without another confirmation',async()=>{
 const m=await import('./harness-launcher');m.registerHarnessLauncher(()=>null);
 await m.stopHarnessForUpdate();expect(mock.stop).toHaveBeenCalledTimes(1);
 expect(mock.show).not.toHaveBeenCalled();expect(m.harnessNeedsExitConfirmation()).toBe(false);
});
it('restores exit confirmation if the installer fails and the agent later runs again',async()=>{
 const m=await import('./harness-launcher');m.registerHarnessLauncher(()=>null);
 await m.stopHarnessForUpdate();expect(m.harnessNeedsExitConfirmation()).toBe(false);
 m.resetHarnessExitAfterUpdateFailure();expect(m.harnessNeedsExitConfirmation()).toBe(true);
});

it('exit card follows system dark theme, while explicit light/dark choices win',async()=>{
 const m=await import('./harness-launcher');m.registerHarnessLauncher(()=>null);mock.show.mockResolvedValue({response:0});
 for(const [theme,systemDark,expected] of [['system',true,true],['system',false,false],['light',true,false],['dark',false,true]] as const){mock.theme=theme;mock.systemDark=systemDark;await m.confirmHarnessExit(null);expect(mock.shownDark).toBe(expected);}
 mock.theme='light';mock.systemDark=false;
});

it('idle new assistant does not show an exit warning',async()=>{
 const m=await import('./harness-launcher');mock.busy=false;
 const assistant={isBusy:()=>false,stop:vi.fn()};m.registerHarnessLauncher(()=>null,assistant);
 expect(m.harnessNeedsExitConfirmation()).toBe(false);expect(await m.confirmHarnessExit(null)).toBe(true);
 expect(mock.show).not.toHaveBeenCalled();expect(assistant.stop).not.toHaveBeenCalled();
});
it('Pi permission wait is protected; cancel preserves the task and confirm stops once',async()=>{
 const m=await import('./harness-launcher');mock.busy=false;let active=true;
 const assistant={isBusy:()=>active,stop:vi.fn(()=>{active=false;})};m.registerHarnessLauncher(()=>null,assistant);
 mock.show.mockResolvedValue({response:0});expect(await m.confirmHarnessExit(null)).toBe(false);
 expect(assistant.stop).not.toHaveBeenCalled();expect(m.harnessNeedsExitConfirmation()).toBe(true);
 const options=mock.show.mock.calls.at(-1)![0];expect(options.message).toBe('退出软件？');
 expect(options.detail).toContain('可能继续计费');expect(options.buttons).toEqual(['取消退出','停止任务并退出']);
 mock.show.mockResolvedValue({response:1});await Promise.all([m.confirmHarnessExit(null),m.confirmHarnessExit(null)]);
 expect(assistant.stop).toHaveBeenCalledTimes(1);expect(mock.stop).toHaveBeenCalledTimes(1);
 expect(m.harnessNeedsExitConfirmation()).toBe(false);
});
