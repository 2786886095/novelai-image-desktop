import {BrowserWindow,screen,type Rectangle} from 'electron';
type Options={title:string;message:string;detail:string;buttons:string[]};
export function exitDialogBounds(anchor:Rectangle,workArea:Rectangle):Rectangle{
  const width=Math.min(460,workArea.width),height=Math.min(280,workArea.height);
  return {width,height,x:Math.max(workArea.x,Math.min(workArea.x+workArea.width-width,Math.round(anchor.x+(anchor.width-width)/2))),y:Math.max(workArea.y,Math.min(workArea.y+workArea.height-height,Math.round(anchor.y+(anchor.height-height)/2)))};
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function exitDialogHTML(options:Options,dark=false){
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>
  :root{color-scheme:${dark?'dark':'light'};--surface:${dark?'#20202a':'#ffffff'};--text:${dark?'#f2effa':'#252235'};--muted:${dark?'#c0bbce':'#686278'};--border:${dark?'#494252':'#e2ddee'};--accent:#7048d8}*{box-sizing:border-box}body{margin:0;padding:22px;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;color:var(--text);background:var(--surface);height:100vh;display:flex;flex-direction:column}h1{font-size:17px;line-height:1.4;margin:0 0 10px}p{margin:0;color:var(--muted);overflow-wrap:anywhere}.body{min-height:0;overflow:auto}footer{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:auto;padding-top:18px}button{font:inherit;min-height:40px;border:1px solid var(--border);border-radius:6px;padding:7px 14px;background:var(--surface);color:var(--text);cursor:pointer}button:last-child{background:var(--accent);border-color:var(--accent);color:white}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}</style>
  <div class="body"><h1>${escape(options.message)}</h1><p>${escape(options.detail)}</p></div><footer><button id="cancel" autofocus>${escape(options.buttons[0])}</button><button id="confirm">${escape(options.buttons[1])}</button></footer>
  <script>const cancel=document.getElementById('cancel'),confirm=document.getElementById('confirm');cancel.onclick=()=>location.href='studio-exit://cancel';confirm.onclick=()=>location.href='studio-exit://confirm';document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel.click()}if(e.key==='Tab'){e.preventDefault();(document.activeElement===cancel?confirm:cancel).focus()}});cancel.focus();</script></html>`;
}
export async function showCenteredExitConfirmation(parent:BrowserWindow|null,options:Options,dark=false):Promise<{response:number}>{
  const owner=parent&&!parent.isDestroyed()?parent:null;
  const anchor=owner?(owner.isMinimized()?owner.getNormalBounds():owner.getBounds()):{...screen.getCursorScreenPoint(),width:1,height:1};
  const area=screen.getDisplayMatching(anchor).workArea,bounds=exitDialogBounds(anchor,area);
  if(owner?.isMinimized())owner.restore();
  if(owner&&!owner.isVisible())owner.show();
  return new Promise(resolve=>{
    let settled=false;
    const win=new BrowserWindow({...bounds,parent:owner??undefined,modal:!!owner,show:false,title:options.title,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,autoHideMenuBar:true,skipTaskbar:true,backgroundColor:dark?'#20202a':'#ffffff',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const finish=(response:number)=>{if(settled)return;settled=true;if(!win.isDestroyed())win.destroy();resolve({response});};
    win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{event.preventDefault();if(url==='studio-exit://confirm')finish(1);else if(url==='studio-exit://cancel')finish(0);});
    win.webContents.on('will-redirect',event=>event.preventDefault());
    win.once('closed',()=>finish(0));
    win.once('ready-to-show',()=>{if(!settled){win.setBounds(bounds);win.show();win.focus();}});
    void win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(exitDialogHTML(options,dark))).catch(()=>finish(0));
  });
}
