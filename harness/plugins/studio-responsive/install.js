// Rebuilt into lib/client.js by build-responsive.mjs. No persisted preferences.
export function installResponsive(css) {
  const root=document.documentElement;
  const modules={settings:'SettingsRoot',theme:'AppearanceRow',models:'ModelsSection',layout:'AppFrame',composer:'InputBar',modelSelect:'ModelSelect'};
  const style=document.createElement('style');style.dataset.studioResponsive='';
  const previous=root.getAttribute('data-studio-responsive');root.dataset.studioResponsive='1';
  let raf=0, disposed=false;
  const marketControls=new Map();
  const marketLabels={zh:'市场说明与导出日志',en:'Market details and export logs',ja:'マーケットの説明とログのエクスポート',ko:'마켓 설명 및 로그 내보내기'};
  function enhanceMarkets(){
    for(const [market,button] of marketControls){if(!market.isConnected){button.remove();marketControls.delete(market);}}
    for(const market of document.querySelectorAll('[data-dsh-market-root]')){
      if(marketControls.has(market))continue;
      const title=market.querySelector('[class$="_titleRow"]');
      if(!title)continue;
      const button=document.createElement('button');button.type='button';button.dataset.studioMarketToggle='';
      const lang=(root.lang||navigator.language||'en').toLowerCase();
      const label=/zh-(tw|hk|hant)/.test(lang)?'市場說明與匯出日誌':marketLabels[lang.split('-')[0]]||marketLabels.en;
      button.setAttribute('aria-label',label);button.title=label;button.textContent='⌄';
      button.setAttribute('aria-expanded','false');market.dataset.studioMarketDetails='closed';
      button.addEventListener('click',()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));market.dataset.studioMarketDetails=expanded?'open':'closed';});
      title.append(button);marketControls.set(market,button);
    }
  }
  function refresh(){
    raf=0;if(disposed)return;
    const styles=[...document.querySelectorAll('style[data-plugin-css]')];
    const resolved=css.replace(/@(\w+)\((\w+)\)/g,(_,module,key)=>{
      const text=styles.find(s=>s.dataset.pluginCss.endsWith('/'+modules[module]+'.module.css'))?.textContent||'';
      const name=text.match(new RegExp('\\.([a-zA-Z0-9_-]+_'+key+')(?![a-zA-Z0-9_-])'))?.[1];
      // Missing upstream module is inert, never a broad selector that changes unrelated UI.
      return name?'.'+CSS.escape(name):'[data-studio-missing-'+module+'-'+key+']';
    });
    if(style.textContent!==resolved)style.textContent=resolved;
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(refresh);}
  function viewport(){
    const v=window.visualViewport;
    // Pinch zoom must remain native: do not resize the layout to the zoomed viewport.
    const normal=!v||Math.abs(v.scale-1)<.02;
    root.style.setProperty('--studio-viewport-height',(normal&&v?v.height:window.innerHeight)+'px');
    root.style.setProperty('--studio-viewport-top',(normal&&v?v.offsetTop:0)+'px');
  }
  document.head.append(style);refresh();viewport();
  enhanceMarkets();
  let marketRaf=0;
  const marketObserver=new MutationObserver(()=>{if(!marketRaf)marketRaf=requestAnimationFrame(()=>{marketRaf=0;if(!disposed)enhanceMarkets();});});
  marketObserver.observe(document.body,{childList:true,subtree:true});
  const observer=new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&n.matches?.('style[data-plugin-css]'))))schedule();});
  observer.observe(document.head,{childList:true});
  window.addEventListener('resize',viewport);window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
  return()=>{disposed=true;observer.disconnect();marketObserver.disconnect();cancelAnimationFrame(marketRaf);for(const [market,button] of marketControls){button.remove();delete market.dataset.studioMarketDetails;}marketControls.clear();cancelAnimationFrame(raf);style.remove();if(previous===null)root.removeAttribute('data-studio-responsive');else root.setAttribute('data-studio-responsive',previous);root.style.removeProperty('--studio-viewport-height');root.style.removeProperty('--studio-viewport-top');window.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('scroll',viewport);};
}
