import './harness-plugin-choice.css';
import type {HarnessPluginChoice} from '../harness-types';
export type PluginDecision='upgrade'|'disable'|'cancel';
/** No implicit disable: Escape, backdrop, navigation and initial focus all mean cancel. */
export function chooseHarnessPlugins(plugins:HarnessPluginChoice[],ft:(text:string)=>string,signal?:AbortSignal):Promise<PluginDecision>{
 return new Promise(resolve=>{
  if(signal?.aborted){resolve('cancel');return;}
  const backdrop=document.createElement('div');backdrop.className='app-confirm-backdrop';
  const dialog=document.createElement('section');dialog.className='app-confirm-dialog harness-plugin-choice';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');
  const title=document.createElement('h3');title.id='harness-plugin-choice-title';title.textContent=ft('选择插件兼容处理方式');dialog.setAttribute('aria-labelledby',title.id);
  const list=document.createElement('ul');
  for(const p of plugins){const row=document.createElement('li');row.textContent=`${p.name} ${p.fromVersion}${p.version?' → '+p.version:''}\n${p.description?p.description+'\n':''}${p.reason}`;list.append(row);}
  
  const note=document.createElement('p');note.textContent=ft('禁用会暂停所列插件提供的功能，不删除插件和配置。其余插件仍需通过兼容检查；安装前备份，可从“更新备份与恢复”还原原来的插件和运行环境。');
  const actions=document.createElement('div');actions.className='app-confirm-actions';
  const previous=document.activeElement as HTMLElement|null;let settled=false;
  const finish=(decision:PluginDecision)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);backdrop.remove();if(previous?.isConnected)previous.focus();resolve(decision);};
  const cancel=()=>finish('cancel');
  const add=(value:PluginDecision,label:string,disabled=false)=>{const button=document.createElement('button');button.type='button';button.textContent=ft(label);button.dataset.decision=value;button.disabled=disabled;button.className=value==='upgrade'?'btn primary':'btn secondary';button.addEventListener('click',()=>finish(value));actions.append(button);return button;};
  const cancelButton=add('cancel','暂不更新，保留现状');
  // Disable affects only entries with no compatible newer release. If every plugin
  // can be upgraded, the alternate choice explicitly disables all listed conflicts.
  const unresolved=plugins.filter(p=>!p.version);
  add('disable',unresolved.length?'禁用未适配插件，其余升级后继续':'禁用所列冲突插件并继续',plugins.some(p=>!p.canDisable));
  add('upgrade','升级兼容插件并继续',!plugins.some(p=>p.version));
  dialog.append(title,list,note,actions);backdrop.append(dialog);document.body.append(backdrop);
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)cancel();});
  backdrop.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel();}if(event.key==='Tab'){event.preventDefault();const buttons=Array.from(actions.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}});
  signal?.addEventListener('abort',cancel,{once:true});backdrop.classList.add('is-visible');cancelButton.focus();
 });
}
