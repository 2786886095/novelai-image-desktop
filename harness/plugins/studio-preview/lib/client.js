window.__ModuleLoader__.load({
  id: '@langbai/dsh-studio-preview',
  factory() {
    function apply(ctx) {
      ctx.effect(() => {
        let overlay = null, cleanup = () => {};
        const open = event => {
          const source = event.target;
          if (!(source instanceof HTMLImageElement) || overlay || source.closest('nav,header,[data-studio-wordmark]') || source.width < 80 || source.height < 80) return;
          const url = source.currentSrc || source.src;
          if (!/^(https?:|blob:|data:image\/)/i.test(url)) return;
          event.preventDefault(); event.stopPropagation();
          const oldFocus = document.activeElement;
          overlay = document.createElement('div');
          overlay.dataset.studioImagePreview = '';
          overlay.setAttribute('role', 'dialog');overlay.setAttribute('aria-modal', 'true');overlay.tabIndex=-1;
          const locale = (document.documentElement.lang || navigator.language).toLowerCase();
          const labels = locale.startsWith('zh') ? (/(tw|hk|hant)/.test(locale) ? ['圖片預覽','關閉','放大','縮小'] : ['图片预览','关闭','放大','缩小']) : locale.startsWith('ja') ? ['画像プレビュー','閉じる','拡大','縮小'] : locale.startsWith('ko') ? ['이미지 미리보기','닫기','확대','축소'] : ['Image preview','Close','Zoom in','Zoom out'];
          overlay.setAttribute('aria-label',labels[0]);
          Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'2147483647',background:'rgba(8,10,16,.9)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',touchAction:'none'});
          const image=document.createElement('img');image.src=url;image.alt=source.alt;image.draggable=false;
          Object.assign(image.style,{maxWidth:'90vw',maxHeight:'85vh',objectFit:'contain',userSelect:'none',touchAction:'none'});
          const toolbar=document.createElement('div');Object.assign(toolbar.style,{position:'absolute',right:'16px',top:'16px',display:'flex',gap:'8px',zIndex:'1'});
          let scale=1,x=0,y=0,drag=null,moved=false;
          const render=()=>image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
          const zoom=delta=>{scale=Math.min(5,Math.max(.25,scale*delta));render();};
          const close=()=>{cleanup();overlay?.remove();overlay=null;if(oldFocus instanceof HTMLElement && oldFocus.isConnected)oldFocus.focus();};
          for(const [text,action] of [[labels[2],()=>zoom(1.25)],[labels[3],()=>zoom(.8)],[labels[1],close]]) {
            const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=action;
            Object.assign(button.style,{padding:'8px 14px',borderRadius:'8px',color:'white',background:'#292936',border:'1px solid #666',cursor:'pointer'});toolbar.append(button);
          }
          overlay.append(image,toolbar);document.body.append(overlay);overlay.focus();
          const down=e=>{if(e.target.closest('button'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:e.target===image,ox:x,oy:y};moved=false;};
          const move=e=>{if(!drag || e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)moved=true;if(drag.pan){x=drag.ox+dx;y=drag.oy+dy;render();}};
          const up=e=>{if(drag?.id===e.pointerId)drag=null;};
          overlay.addEventListener('pointerdown',down);document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
          overlay.onclick=e=>{if(e.target===overlay&&!moved)close();};
          overlay.onwheel=e=>{e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1);};
          const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Tab'){e.preventDefault();const buttons=[...toolbar.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}};
          document.addEventListener('keydown',key,true);
          cleanup=()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);};
        };
        document.addEventListener('dblclick',open,true);
        return()=>{cleanup();overlay?.remove();document.removeEventListener('dblclick',open,true);};
      });
    }
    return {apply};
  },
});
