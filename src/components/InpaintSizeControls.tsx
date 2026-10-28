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
  const labels = {work:'选区工作尺寸',hint:'只调整选区至约 1 MP 工作尺寸后贴回；保留原图尺寸与选区外像素。退出选区后恢复自定义尺寸设置。'};
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
