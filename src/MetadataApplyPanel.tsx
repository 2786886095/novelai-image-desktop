import { useState } from 'react';
import { Button } from './components/ui';
import { Icon } from './components/icons';
import type { ImageMetadataReport } from './png-meta';
import type { AppLanguage } from './types';
import { metadataApplyKeys, selectedMetadata, type MetadataApplyKey } from './metadata-selection';
import { useAppStore } from './store';

const TEXT = {
  'zh-CN': ['选择要应用的参数','全选','全不选','应用所选到生成','未勾选的项目保留生成页当前值。种子与固定模式一起恢复。','已应用所选参数','原图未嵌入参考图文件；全选会清空当前参考图，原图若使用参考素材需另行导入。','即使参数一致，服务端模型版本变化及缺失的参考素材仍可能影响复现。'],
  'zh-TW': ['選擇要套用的參數','全選','全不選','套用所選到生成','未勾選項目保留生成頁目前值。種子與固定模式一起恢復。','已套用所選參數','原圖未嵌入參考圖檔案；全選會清空目前參考圖，若原圖使用參考素材需另行匯入。','即使參數一致，服務端模型版本變更與缺少的參考素材仍可能影響重現。'],
  'en-US': ['Choose settings to apply','Select all','Clear selection','Apply selected to Generate','Unchecked settings remain unchanged. Seed and seed mode are restored together.','Selected settings applied','Reference image files are not embedded. Selecting all clears current references; import the original assets separately if needed.','Backend model revisions and missing reference assets can still affect reproduction.'],
  'ja-JP': ['適用する設定を選択','すべて選択','選択解除','選択した設定で生成画面へ','未選択の項目は現在値を維持。シードと固定モードは同時に復元します。','選択した設定を適用しました','参照画像ファイルは含まれていません。全選択では現在の参照画像を消去します。必要な素材は別途読み込んでください。','サーバー側モデルの更新や参照素材の不足は再現結果に影響します。'],
  'ko-KR': ['적용할 설정 선택','전체 선택','선택 해제','선택한 설정 적용','선택하지 않은 항목은 유지됩니다. 시드와 고정 모드는 함께 복원됩니다.','선택한 설정을 적용했습니다','참조 이미지 파일은 포함되지 않습니다. 전체 선택 시 현재 참조를 비웁니다. 필요한 원본 참조를 별도로 가져오세요.','서버 모델 변경이나 참조 파일 누락은 재현 결과에 영향을 줄 수 있습니다.'],
} satisfies Record<AppLanguage, string[]>;
const LABELS: Record<string, [string,string]> = {
  positivePrompt:['正面提示词','Positive prompt'], negativePrompt:['负面提示词','Negative prompt'],stylePrompt:['风格提示词','Style prompt'],
  model:['模型','Model'],steps:['步数','Steps'],cfgScale:['CFG 强度','CFG scale'],cfgRescale:['CFG 重缩放','CFG rescale'],sampler:['采样器','Sampler'],noiseSchedule:['噪声调度','Noise schedule'],seed:['种子（固定）','Seed (fixed)'],seedMode:['种子模式','Seed mode'],width:['宽度','Width'],height:['高度','Height'],smea:['SMEA','SMEA'],smeaDyn:['动态 SMEA','SMEA Dyn'],ucPreset:['负面预设','UC preset'],qualityPreset:['质量预设','Quality preset'],qualityToggle:['质量增强','Quality toggle'],transparentBackground:['透明背景','Transparent background'],variety:['多样化','Variety+'],preservePromptText:['保留提示词原文与重复 Tag','Preserve exact prompt text'],metadataReplay:['原图高级采样参数','Original sampling flags'],characterCaptions:['独立角色提示词与位置','Character prompts and positions'],referenceImages:['清空当前参考图','Clear current reference images'],modelMode:['动漫 / Furry 模式','Anime / Furry mode'],
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
  const text=TEXT[language]; const chinese=language.startsWith('zh');
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
          aria-label={LABELS[key]?.[chinese?0:1]??key} className="metadata-select-item"
          onClick={()=>setSelected(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;})}>
          <span className="metadata-select-check"><Icon name="check"/></span>
          <span><strong>{LABELS[key]?.[chinese?0:1]??key}</strong><small title={display}>{display}</small></span>
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
