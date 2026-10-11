import {motionReduced,STUDIO_MOTION} from '../motion-system';
import {workflowText} from '../workflow-text';
import {useAppStore} from '../store';
import {useEffect,useRef,useState} from 'react';
import {AppPortal} from './ui';
import {PreviewImageViewer,type PreviewImage} from './PreviewImageViewer';
export function ImagePreviewDialog({images,index,onIndex,onClose}:{images:PreviewImage[];index:number;onIndex:(index:number)=>void;onClose:()=>void}) {
 const text=workflowText(useAppStore(s=>s.settings?.language));
 const [closing,setClosing]=useState(false),previous=useRef(document.activeElement as HTMLElement|null),root=useRef<HTMLElement>(null),done=useRef(onClose);done.current=onClose;
 useEffect(()=>{if(!closing)return;const timer=setTimeout(()=>done.current(),motionReduced()?0:STUDIO_MOTION.exit);return()=>clearTimeout(timer);},[closing]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setClosing(true);return;}if(e.key!=='Tab')return;const nodes=[...root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')??[]].filter(n=>n.getClientRects().length);if(!nodes.length)return;if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous.current?.isConnected&&previous.current.focus({preventScroll:true});};},[]);
 return <AppPortal><div className="image-preview-dialog-backdrop" data-closing={closing} onClick={e=>{if(e.detail<2&&e.target===e.currentTarget)setClosing(true);}}><section ref={root} role="dialog" aria-modal="true" aria-label={images[index]?.alt||text.preview} className="image-preview-dialog"><button className="image-preview-close" type="button" aria-label={text.close} onClick={()=>setClosing(true)}>×</button><PreviewImageViewer images={images} index={index} onIndex={onIndex} onBackgroundClick={()=>setClosing(true)}/></section></div></AppPortal>;
}
