import {BrowserWindow,screen,type Rectangle} from 'electron';
type Options={title:string;message:string;detail:string;buttons:string[]};
export function exitDialogBounds(anchor:Rectangle,workArea:Rectangle):Rectangle{
  const width=Math.min(420,workArea.width),height=Math.min(220,workArea.height);
  return {width,height,x:Math.max(workArea.x,Math.min(workArea.x+workArea.width-width,Math.round(anchor.x+(anchor.width-width)/2))),y:Math.max(workArea.y,Math.min(workArea.y+workArea.height-height,Math.round(anchor.y+(anchor.height-height)/2)))};
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function exitDialogHTML(options:Options,dark=false){
  // Mirror the application's semantic surface/accent tokens. This isolated,
  // sandboxed window must still work when the main renderer is busy closing.
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(options.title)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>
  :root{color-scheme:${dark?'dark':'light'};--bg-dialog:${dark?'#181725':'#ffffff'};--text-primary:${dark?'#f0edf8':'#211b2e'};--text-secondary:${dark?'#c0b9d2':'#625a75'};--border:${dark?'#393247':'#dcd7ee'};--accent:${dark?'#9d82f0':'#7047d8'};--accent-hover:${dark?'#b49cf5':'#5e35c7'};--accent-text:${dark?'#171125':'#ffffff'};--accent-soft:${dark?'#28213d':'#eee9fb'};--bg-hover:${dark?'#282438':'#ece7f9'}}
  *{box-sizing:border-box}html,body{margin:0;height:100%;background:transparent}body{padding:8px;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;color:var(--text-primary)}
  .dialog{height:100%;padding:18px;border:1px solid var(--border);border-radius:14px;background:var(--bg-dialog);box-shadow:0 3px 8px #00000014;display:flex;flex-direction:column;animation:appear 160ms ease-out}
  .content{min-height:0;overflow:auto;display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;scrollbar-width:thin}
  .icon{width:32px;height:32px;border-radius:10px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;-webkit-app-region:drag}.icon svg{width:18px;height:18px}
  h1{font-size:16px;font-weight:600;line-height:1.5;margin:0 0 6px;overflow-wrap:anywhere;-webkit-app-region:drag}p{margin:0;color:var(--text-secondary);overflow-wrap:anywhere;line-height:1.65}
  footer{display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;margin-top:auto;padding-top:14px}
  button{font:inherit;font-weight:550;line-height:1.35;min-height:40px;border:1px solid var(--border);border-radius:6px;padding:8px 12px;background:var(--bg-dialog);color:var(--text-primary);cursor:pointer;transition:background-color 120ms,border-color 120ms;overflow-wrap:anywhere;-webkit-app-region:no-drag}
  button:hover{background:var(--bg-hover)}#confirm{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}#confirm:hover{background:var(--accent-hover);border-color:var(--accent-hover)}button:focus-visible{outline:2px solid color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:2px}button:active{filter:brightness(.96)}
  @keyframes appear{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.dialog{animation:none}button{transition:none}}
  @media(pointer:coarse){button{min-height:44px}}
  @media(max-width:360px){.dialog{padding:18px}.content{grid-template-columns:32px minmax(0,1fr);gap:12px}.icon{width:32px;height:32px}h1{font-size:16px}footer{padding-top:14px}button{flex:1;padding:9px 10px}}
  </style></head><body><main class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="heading" aria-describedby="detail">
  <section class="content"><div class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9M6.3 5.7a8 8 0 1 0 11.4 0"/></svg></div><div><h1 id="heading">${escape(options.message)}</h1><p id="detail">${escape(options.detail)}</p></div></section><footer><button id="cancel" autofocus>${escape(options.buttons[0])}</button><button id="confirm">${escape(options.buttons[1])}</button></footer></main>
  <script>const cancel=document.getElementById('cancel'),confirm=document.getElementById('confirm');let decided=false;const finish=value=>{if(decided)return;decided=true;location.href='studio-exit://'+value};cancel.onclick=()=>finish('cancel');confirm.onclick=()=>finish('confirm');document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel.click()}if(e.key==='Tab'){e.preventDefault();(document.activeElement===cancel?confirm:cancel).focus()}});cancel.focus();</script></body></html>`;
}
export async function showCenteredExitConfirmation(parent:BrowserWindow|null,options:Options,dark=false):Promise<{response:number}>{
  const owner=parent&&!parent.isDestroyed()?parent:null;
  const anchor=owner?(owner.isMinimized()?owner.getNormalBounds():owner.getBounds()):{...screen.getCursorScreenPoint(),width:1,height:1};
  const area=screen.getDisplayMatching(anchor).workArea,bounds=exitDialogBounds(anchor,area);
  if(owner?.isMinimized())owner.restore();
  if(owner&&!owner.isVisible())owner.show();
  return new Promise(resolve=>{
    let settled=false;
    const win=new BrowserWindow({...bounds,parent:owner??undefined,modal:!!owner,show:false,title:options.title,frame:false,transparent:true,hasShadow:true,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,autoHideMenuBar:true,skipTaskbar:true,backgroundColor:'#00000000',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const finish=(response:number)=>{if(settled)return;settled=true;if(!win.isDestroyed())win.destroy();resolve({response});};
    win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{event.preventDefault();if(url==='studio-exit://confirm')finish(1);else if(url==='studio-exit://cancel')finish(0);});
    win.webContents.on('will-redirect',event=>event.preventDefault());
    win.once('closed',()=>finish(0));
    win.once('ready-to-show',()=>{if(!settled){win.setBounds(bounds);win.show();win.focus();}});
    void win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(exitDialogHTML(options,dark))).catch(()=>finish(0));
  });
}
