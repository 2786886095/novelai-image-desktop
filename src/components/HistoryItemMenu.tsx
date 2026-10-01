import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useDisclosurePresence,disclosureAttributes} from './disclosure-motion';
import {Icon} from './icons';
import {ImageFavoriteButton} from './ImageFavoriteButton';
import './history-item-menu.css';

/** No backdrop: an outside image click dismisses the menu AND selects the image. */
export function HistoryItemMenu({src, label, metadataLabel, renameLabel, deleteLabel, metadataTitle, renameTitle, deleteTitle, filePathLabel, onFilePath, onMetadata, onRename, onDelete}: {
  src:string; label:string; metadataLabel:string; renameLabel:string; deleteLabel:string;
  filePathLabel?:string; onFilePath?:()=>void;
  metadataTitle?:string; renameTitle?:string; deleteTitle?:string;
  onMetadata:()=>void; onRename:()=>void; onDelete:()=>void;
}) {
  const [open,setOpen]=useState(false);
  const present=useDisclosurePresence(open);
  const [position,setPosition]=useState({left:0,top:0});
  const trigger=useRef<HTMLButtonElement>(null), menu=useRef<HTMLDivElement>(null);
  const id=useId();
  const close=(restore=false)=>{setOpen(false);if(restore)trigger.current?.focus({preventScroll:true});};
  const updatePosition=useCallback(()=>{
    const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
    const width=menu.current?.getBoundingClientRect().width??Math.min(160,window.innerWidth-16);
    const height=menu.current?.getBoundingClientRect().height??196;
    setPosition({left:Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8)),top:rect.bottom+height+6<window.innerHeight?rect.bottom+6:Math.max(8,rect.top-height-6)});
  },[]);
  useLayoutEffect(()=>{
    if(!open)return;updatePosition();
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  },[open,updatePosition]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);};
    const scroll=(event:Event)=>{if(!menu.current?.contains(event.target as Node))updatePosition();};
    const resize=updatePosition;
    document.addEventListener('pointerdown',outside,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',resize);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',resize);};
  },[open,updatePosition]);
  const action=(fn:()=>void)=>{close();fn();};
  return <><button ref={trigger} type="button" className="history-more-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={event=>{event.stopPropagation();setOpen(value=>!value)}}><Icon name="moreHorizontal"/></button>
    {present&&createPortal(<div {...disclosureAttributes(open)} ref={menu} id={id} role="menu" aria-label={label} className="history-action-menu" style={position} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
      else if(event.key==='Tab'){close(true);}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const items=[...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const index=items.indexOf(document.activeElement as HTMLButtonElement);
        const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus({preventScroll:true});
      }
    }}>
      <ImageFavoriteButton src={src} menuItem/>
      <button type="button" role="menuitem" title={metadataTitle??metadataLabel} onClick={()=>action(onMetadata)}><Icon name="eye"/>{metadataLabel}</button>
      {onFilePath&&<button type="button" role="menuitem" onClick={()=>action(onFilePath)}><Icon name="folder"/>{filePathLabel}</button>}
      <button type="button" role="menuitem" title={renameTitle??renameLabel} onClick={()=>action(onRename)}><Icon name="brush"/>{renameLabel}</button>
      <button type="button" role="menuitem" title={deleteTitle??deleteLabel} className="is-danger" onClick={()=>action(onDelete)}><Icon name="trash"/>{deleteLabel}</button>
    </div>,document.body)}
  </>;
}
