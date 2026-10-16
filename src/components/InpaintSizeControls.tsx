import { inpaintSizePlan, inpaintSizeText, type InpaintSize, type InpaintSizeMode } from '../inpaint-size';
import { ResolutionPicker } from './CompactPromptControls';
import type { InpaintRegion } from '../focused-inpaint';

export function InpaintSizeControls({ mode, custom, source, region, language, onMode, onSize }: {
  mode: InpaintSizeMode; custom: InpaintSize; source: InpaintSize | null; language?: string;
  region?: InpaintRegion | null;
  onMode: (mode: InpaintSizeMode) => void; onSize: (size: InpaintSize) => void;
}) {
  const text = inpaintSizeText(language);
  const focused = Boolean(region);
  const labels = language?.startsWith('zh-TW') ? {work:'選區工作尺寸',hint:'只調整選區至約 1 MP 工作尺寸後貼回；保留原圖尺寸與選區外像素。退出選區後恢復自訂尺寸設定。'}
    : language?.startsWith('ja') ? {work:'選択範囲の処理サイズ',hint:'選択範囲のみ約1 MPで処理して元画像へ合成します。元画像のサイズと範囲外の画素は維持されます。'}
    : language?.startsWith('ko') ? {work:'선택 영역 작업 크기',hint:'선택 영역만 약 1 MP로 처리한 뒤 원본에 합성합니다. 원본 크기와 영역 밖 픽셀은 유지됩니다.'}
    : language?.startsWith('zh') || !language ? {work:'选区工作尺寸',hint:'只调整选区至约 1 MP 工作尺寸后贴回；保留原图尺寸与选区外像素。退出选区后恢复自定义尺寸设置。'}
    : {work:'Selected crop work size',hint:'Only the crop is processed at about 1 MP and pasted back. Original dimensions and pixels outside the mask are retained. Saved custom size resumes after clearing the crop.'};
  let output: InpaintSize | undefined, request: InpaintSize | undefined, error = '';
  if (source) { try { const plan = inpaintSizePlan(mode, custom, source, region, language); output = plan.outputSize; request = plan.requestSize; } catch (e) { error = (e as Error).message; } }
  return <div className="field inpaint-size-controls">
    <span>{text.title}</span>
    <div className="mode-buttons" role="group" aria-label={text.title}>
      <button type="button" className={`btn ${focused || mode === 'original' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={focused || mode === 'original'} onClick={() => {if (!focused) onMode('original');}}>{text.original}</button>
      <button type="button" className={`btn ${!focused && mode === 'custom' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={!focused && mode === 'custom'} disabled={focused} onClick={() => onMode('custom')}>{text.custom}</button>
    </div>
    {!focused && mode === 'custom' && <ResolutionPicker width={custom.width} height={custom.height} language={language} onChange={onSize} maxDimension={1600}>
     <div className="dimension-inputs">
      <label>{text.width}<input data-testid="inpaint-width" type="number" min={64} max={1600} step={64} value={custom.width || ''} onChange={e => onSize({ ...custom, width: Number(e.target.value) })}/></label>
      <span>×</span>
      <label>{text.height}<input data-testid="inpaint-height" type="number" min={64} max={1600} step={64} value={custom.height || ''} onChange={e => onSize({ ...custom, height: Number(e.target.value) })}/></label>
     </div>
    </ResolutionPicker>}
    <small className="field-hint">{source ? `${text.output}: ${output ? `${output.width}×${output.height}` : '—'}` : text.missing}</small>
    {focused && request && <small className="field-hint" data-testid="inpaint-work-size">{labels.work}: {request.width}×{request.height}</small>}
    <small className="field-hint">{focused ? labels.hint : text.rule}</small>
    {error && <small role="alert" className="field-hint warning">{error}</small>}
  </div>;
}
