// Upgrade literal image paths rendered by Harness Markdown, including existing
// messages. Use DOM text only (no HTML parsing) and defer authorization to host.
export function installFileLinks(root,call){
 let closed=false,queued=false;const records=new Map();
 let label='打开所在文件夹并选中图片',openedText='已请求打开所在文件夹';
 const filePath=node=>{const value=node.textContent?.trim()??'';return value.length<=4096&&/^(?:[A-Za-z]:[\\/]|\/)[^\r\n\x00]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(value)?value:null};
 function scan(){
  queued=false;if(closed)return;
  for(const [node,dispose] of records)if(!node.isConnected||!filePath(node)){dispose();records.delete(node)}
  for(const node of root.querySelectorAll('code')){
   if(records.has(node)||node.closest('pre,button,a,[contenteditable="true"],.studio-library'))continue;
   if(!filePath(node))continue;
   const prior={role:node.getAttribute('role'),tabindex:node.getAttribute('tabindex'),title:node.getAttribute('title')};
   node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('title',label);node.classList.add('studio-file-link');
   const status=document.createElement('span');status.className='studio-file-link-status';status.setAttribute('role','status');
   node.after(status);let busy=false;
   const open=async event=>{
    if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
    event.preventDefault();if(busy)return;const value=filePath(node);if(!value)return;
    busy=true;node.setAttribute('aria-busy','true');status.textContent=' 正在打开…';
    try{await call('studio_reveal_image',{action:'reveal',filePath:value});status.textContent=' '+openedText}
    catch(error){status.textContent=' '+error.message}
    finally{busy=false;node.removeAttribute('aria-busy')}
   };
   node.addEventListener('click',open);node.addEventListener('keydown',open);
   records.set(node,()=>{node.removeEventListener('click',open);node.removeEventListener('keydown',open);node.classList.remove('studio-file-link');for(const [key,value] of Object.entries(prior))value===null?node.removeAttribute(key):node.setAttribute(key,value);status.remove()});
  }
 }
 const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(scan)}});
 void call('studio_reveal_image',{action:'capabilities'}).then(data=>{if(closed||!data?.reveal)return;if(typeof data.label==='string'&&data.label.length<=80)label=data.label;if(typeof data.openedText==='string'&&data.openedText.length<=120)openedText=data.openedText;scan();observer.observe(root,{childList:true,subtree:true,characterData:true})}).catch(()=>{});
 return()=>{closed=true;observer.disconnect();for(const dispose of records.values())dispose();records.clear()};
}
export const fileLinkCSS='.studio-file-link{cursor:pointer;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.studio-file-link:focus-visible{outline:2px solid currentColor;outline-offset:3px}.studio-file-link-status{font-size:.85em;opacity:.8;overflow-wrap:anywhere}';
