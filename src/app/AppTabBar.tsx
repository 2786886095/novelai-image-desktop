import {SelectMenu} from '../components/ui';
import {countTabsThatFit} from './tab-overflow';
import {promptSetupText} from '../prompt-ui-settings';
import './tab-overflow.css';
import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { Icon } from "../components/icons";
import { getLocalizedTabItems } from "../i18n";
import { useAppStore } from "../store";
import {loadTabOrder,saveTabOrder,moveTab,normalizeTabOrder} from './tab-order';
import {favoritesText} from '../favorites-text';
import type {ActiveTab} from './navigation';

function AppTabBar() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const language = useAppStore((state) => state.settings?.language);
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef=useRef<HTMLDivElement>(null);
  const [visibleCount,setVisibleCount]=useState(0);
  const [order,setOrder]=useState(loadTabOrder);
  useEffect(()=>{const reload=()=>setOrder(loadTabOrder());window.addEventListener('studio:collections-changed',reload);return()=>window.removeEventListener('studio:collections-changed',reload);},[]);
  const [editing,setEditing]=useState(false);
  const [dragging,setDragging]=useState<ActiveTab|null>(null);
  const [over,setOver]=useState<ActiveTab|null>(null);
  const text=favoritesText(language);
  const persist=(next:ActiveTab[])=>{try{saveTabOrder(next);setOrder(next);}catch{useAppStore.getState().setToast(text.saveFailed);}};
  const [indicator, setIndicator] = useState({ x: 0, width: 0, ready: false });
  const tabItems = useMemo(
    () => {const items=getLocalizedTabItems(language);return order.map(id=>items.find(x=>x.value===id)!).filter(Boolean);},
    [language,order],
  );

  useLayoutEffect(()=>{
    const bar=barRef.current,measure=measureRef.current;if(!bar||!measure)return;
    const update=()=>{const style=getComputedStyle(bar),gap=parseFloat(style.columnGap)||0,padding=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
      const widths=[...measure.querySelectorAll<HTMLElement>('[data-measure]')].map(el=>el.getBoundingClientRect().width);
      const available=bar.clientWidth-padding;
      setVisibleCount(countTabsThatFit(widths,available,gap,80));
    };
    update();const observer=new ResizeObserver(update);observer.observe(bar);observer.observe(measure);for(const el of measure.children)observer.observe(el);
    let disposed=false;void document.fonts.ready.then(()=>{if(!disposed)update();});
    return()=>{disposed=true;observer.disconnect();};
  },[tabItems,editing]);
  const hiddenItems=tabItems.slice(visibleCount);
  const visibleItems=editing?tabItems:tabItems.slice(0,visibleCount);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const updateIndicator = () => {
      const active = bar.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (!active) {setIndicator(previous=>({...previous,ready:false}));return;}
      const barRect = bar.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      setIndicator({ x: rect.left - barRect.left + bar.scrollLeft, width: rect.width, ready: true });
    };
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(bar);
    window.addEventListener("resize", updateIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [activeTab, tabItems, visibleCount, editing]);

  return (
    <nav className="tab-navigation responsive-tab-navigation" data-editing={editing} aria-label={text.edit}>
    <div ref={measureRef} className="tab-bar tab-measure-strip" aria-hidden="true" inert>{tabItems.map(({value,label,icon})=><button key={value} data-measure={value} tabIndex={-1} type="button"><span className="tab-icon"><Icon name={icon}/></span><span>{label}</span></button>)}</div>
    <div className="tab-navigation-row"><div
      ref={barRef}
      className="tab-bar"
      style={{
        "--tab-indicator-x": `${indicator.x}px`,
        "--tab-indicator-width": `${indicator.width}px`,
      } as CSSProperties}
    >
      <span className={clsx("tab-active-indicator", indicator.ready && "is-ready")} aria-hidden="true" />
      {visibleItems.map(({ value, label, icon, title }) => (
        <button
          key={value}
          type="button"
          data-tab={value}
          className={clsx(activeTab === value && "active")}
          aria-label={title}
          aria-current={activeTab === value ? "page" : undefined}
          draggable={editing}
          data-reorder-over={over===value||undefined}
          aria-describedby={editing?'tab-reorder-help':undefined}
          title={editing?text.help:title}
          onDragStart={e=>{setDragging(value);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',value);}}
          onDragOver={e=>{if(editing&&dragging){e.preventDefault();e.dataTransfer.dropEffect='move';setOver(value);}}}
          onDrop={e=>{if(editing&&dragging){e.preventDefault();persist(moveTab(order,dragging,value));}setDragging(null);setOver(null);}}
          onDragEnd={()=>{setDragging(null);setOver(null);}}
          onKeyDown={e=>{if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();const index=order.indexOf(value),other=order[index+(e.key==='ArrowLeft'?-1:1)];if(other)persist(moveTab(order,value,other));}else if(e.key==='Escape')setEditing(false);}}
          onClick={() => {if(!editing)startTransition(() => setActiveTab(value));}}
        >
          <span className="tab-icon"><Icon name={icon} /></span>
          <span>{label}</span>
        </button>
      ))}
    {!editing&&hiddenItems.length>0&&<div className={clsx('tab-overflow-control',hiddenItems.some(item=>item.value===activeTab)&&'has-active')}>
      <SelectMenu ariaLabel={promptSetupText(language).more} label={promptSetupText(language).more} value={hiddenItems.some(item=>item.value===activeTab)?activeTab:''} options={hiddenItems.map(item=>({value:item.value,label:item.label}))} onChange={value=>startTransition(()=>setActiveTab(value as ActiveTab))}/>
    </div>}
    </div><button type="button" className="btn tab-arrange-toggle" aria-pressed={editing} onClick={()=>setEditing(!editing)}>{editing?text.done:text.edit}</button></div>
    {editing&&<div className="tab-reorder-help" id="tab-reorder-help"><span>{text.help}</span><button className="btn" onClick={()=>persist(normalizeTabOrder(null))}>{text.reset}</button></div>}
    </nav>
  );
}

export default memo(AppTabBar);
