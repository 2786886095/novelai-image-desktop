import { useState } from 'react';
import { Button } from './components/ui';
import { Icon } from './components/icons';
import type { ImageMetadataReport } from './png-meta';
import type { AppLanguage } from './types';
import { metadataApplyKeys, selectedMetadata, type MetadataApplyKey } from './metadata-selection';
import { useAppStore } from './store';

const TEXT = {
  'zh-CN': ['选择要应用的参数','全选','全不选','应用所选到生成','未勾选的项目保留生成页当前值。种子与固定模式一起恢复。','已应用所选参数','原图未嵌入参考图文件；全选会清空当前参考图，原图若使用参考素材需另行导入。','即使参数一致，服务端模型版本变化及缺失的参考素材仍可能影响复现。'],
} satisfies Record<AppLanguage, string[]>;
const LABELS: Record<string, string> = {
  positivePrompt:'正面提示词', negativePrompt:'负面提示词',stylePrompt:'风格提示词',
  model:'模型',steps:'步数',cfgScale:'CFG 强度',cfgRescale:'CFG 重缩放',sampler:'采样器',noiseSchedule:'噪声调度',seed:'种子（固定）',seedMode:'种子模式',width:'宽度',height:'高度',smea:'SMEA',smeaDyn:'动态 SMEA',ucPreset:'负面预设',qualityPreset:'质量预设',qualityToggle:'质量增强',transparentBackground:'透明背景',variety:'多样化',preservePromptText:'保留提示词原文与重复 Tag',metadataReplay:'原图高级采样参数',characterCaptions:'独立角色提示词与位置',referenceImages:'清空当前参考图',modelMode:'动漫 / Furry 模式',
};
export function MetadataApplyPanel({report,language}: {report:ImageMetadataReport;language:AppLanguage}) {
  // Remount on a new report; returning to the same image preserves the user's selection.
  return <MetadataApplyPanelInner key={report.rawText} report={report} language={language}/>;
}
function MetadataApplyPanelInner({report,language}: {report:ImageMetadataReport;language:AppLanguage}) {
  const keys=metadataApplyKeys(report);
  const [selected,setSelected]=useState<Set<MetadataApplyKey>>(()=>new Set(keys));
  const restore=useAppStore(state=>state.restoreImportedMetadata);
  const setTab=useAppStore(state=>state.setActiveTab);
  const toast=useAppStore(state=>state.setToast);
  const text=TEXT[language];
  return <section className="metadata-section metadata-apply-panel" aria-label={text[0]}>
    <details className="metadata-apply-disclosure" open>
      <summary className="metadata-apply-heading">
        <strong>{text[0]} · {selected.size}/{keys.length}</strong>
        <Icon name="chevronRight" className="disclosure-chevron" />
      </summary>
    <div className="metadata-apply-actions">
      <Button variant="ghost" onClick={()=>setSelected(new Set(keys))}>{text[1]}</Button>
      <Button variant="ghost" onClick={()=>setSelected(new Set())}>{text[2]}</Button></div>
    <p className="muted">{text[4]}</p>
    <div className="metadata-compatible-grid">
      {keys.map(key=>{
        const value=key==='characterCaptions' ? report.characterCaptions.length
          : key==='referenceImages' ? '0' : key==='modelMode' ? (/fur dataset/i.test(report.imported.positivePrompt??'')?'Furry':'Anime') : report.imported[key];
        const display=value===''?'∅':typeof value==='object'?JSON.stringify(value):String(value);
        return <button key={key} type="button" role="checkbox" aria-checked={selected.has(key)}
          aria-label={LABELS[key]??key} className="metadata-select-item"
          onClick={()=>setSelected(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;})}>
          <span className="metadata-select-check"><Icon name="check"/></span>
          <span><strong>{LABELS[key]??key}</strong><small title={display}>{display}</small></span>
        </button>;
      })}
    </div>
    {report.kind==='novelai'&&<p className="muted">{text[6]} {text[7]}</p>}
    </details>
    <Button variant="primary" disabled={selected.size===0} onClick={()=>{
      const result=selectedMetadata(report,selected);restore(result.patch,result.captions,result.options);
      setTab('generate');toast(text[5]);
    }}>{text[3]}</Button>
  </section>;
}
