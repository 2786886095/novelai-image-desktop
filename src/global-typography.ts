import {useEffect} from 'react';
import {typographyRoleScale} from './typography-hierarchy';
import {fontFamily,isImportedFont,normalizeTypography,typographyText} from './typography';
import {builtinFont} from './builtin-fonts';
const fonts=new Map<string,Promise<void>>();
export async function ensureUiFontLoaded(id:string):Promise<void> {
  const bundled=builtinFont(id);
  if(!bundled&&!isImportedFont(id))return;
  const old=fonts.get(id);if(old)return old;
  const promise=(async()=>{
    // Resolve against the built renderer document: file:// in Electron, local assets in Vite.
    // Only the selected font loads; current/default choices never download or load all six.
    const source=bundled ? `url("${new URL('./ui-fonts/'+bundled.file,document.baseURI).href}")` :
      Uint8Array.from(atob(await window.naiDesktop.readUiFont(id)),c=>c.charCodeAt(0)).buffer;
    const face=new FontFace('Studio-'+id,source);await face.load();document.fonts.add(face);
  })();fonts.set(id,promise);try{await promise;}catch(e){fonts.delete(id);throw e;}
}
/** Mirror only absolute font sizes, not em/rem: those already inherit the scaled root.
 * Grouping rules retain their media/supports conditions; original styles never change. */
export function scaledFontRules(rules:CSSRuleList):string {
  return Array.from(rules).map(rule=>{
    if(rule instanceof CSSStyleRule){const size=rule.style.fontSize;
      if(size.includes('--ui-') || !/\b[\d.]+px\b|var\(--(?:font-size-min|studio-page-title|studio-section-title)\)/.test(size))return '';
      return `${rule.selectorText}{font-size:calc(${size} * var(--ui-element-text-scale, var(--ui-text-scale)))${rule.style.getPropertyPriority('font-size')?' !important':''};}`;
    }
    if(rule instanceof CSSImportRule){try{return rule.styleSheet?scaledFontRules(rule.styleSheet.cssRules):'';}catch{return '';}}
    if('cssRules' in rule && !(rule instanceof CSSKeyframesRule)) {
      const content=scaledFontRules((rule as CSSGroupingRule).cssRules);return content?`${rule.cssText.slice(0,rule.cssText.indexOf('{'))}{${content}}`:'';
    }
    return '';
  }).join('\n');
}
export function installTypography(scale:number,family:string):()=>void {
  const root=document.documentElement,style=document.createElement('style');style.dataset.uiTypography='';
  root.style.setProperty('--ui-text-scale',String(typographyRoleScale(scale,'body')));root.dataset.uiTextScale=String(scale);
  for(const role of ['title','control','secondary'] as const) root.style.setProperty('--ui-'+role+'-scale',String(typographyRoleScale(scale,role)));
  root.style.setProperty('--ui-pane-extra',String(Math.max(0,scale/100-1)*40)+'px');
  if(family)root.style.setProperty('--ui-font-family',family);
  let frame=0;
  const rebuild=()=>{
    const css=scale===100?'':Array.from(document.styleSheets).filter(s=>s.ownerNode!==style&&!s.disabled).map(s=>{try{return scaledFontRules(s.cssRules);}catch{return '';}}).join('\n');
    const global=family?'html, body, body * {font-family:var(--ui-font-family) !important;} .btn-icon, .select-menu-option-icon {font-family:"Segoe UI Symbol",system-ui,sans-serif !important;}':'';
    const next=css+'\n'+global;if(style.textContent!==next)style.textContent=next;
  };
  document.head.append(style);rebuild();
  const observer=new MutationObserver(records=>{
    if(records.every(r=>r.target===style||style.contains(r.target)||Array.from(r.addedNodes).every(n=>n===style)&&r.addedNodes.length>0))return;
    cancelAnimationFrame(frame);frame=requestAnimationFrame(rebuild);
  });observer.observe(document.head,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','media','disabled']});
  const loaded=()=>rebuild();document.addEventListener('load',loaded,true);
  return ()=>{observer.disconnect();document.removeEventListener('load',loaded,true);cancelAnimationFrame(frame);style.remove();root.style.removeProperty('--ui-text-scale');for(const role of ['title','control','secondary'])root.style.removeProperty('--ui-'+role+'-scale');root.style.removeProperty('--ui-pane-extra');root.style.removeProperty('--ui-font-family');delete root.dataset.uiTextScale;};
}
export function useGlobalTypography(raw:unknown) {
  const {font,scale}=normalizeTypography(raw);
  useEffect(()=>{
    let cancelled=false,cleanup=installTypography(scale,(isImportedFont(font)||builtinFont(font))?'':fontFamily(font));
    void ensureUiFontLoaded(font).then(()=>{
      if(cancelled)return;cleanup();cleanup=installTypography(scale,fontFamily(font));window.dispatchEvent(new Event('resize'));
    }).catch(()=>{
      if(cancelled)return;
      window.dispatchEvent(new CustomEvent('ui-font-missing',{detail:typographyText(document.documentElement.lang).missing}));
    });
    return ()=>{cancelled=true;cleanup();};
  },[font,scale]);
}
