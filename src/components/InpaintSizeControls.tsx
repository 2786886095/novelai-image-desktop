import { inpaintSizePlan, inpaintSizeText, type InpaintSize, type InpaintSizeMode } from '../inpaint-size';
import { ResolutionPicker } from './CompactPromptControls';

export function InpaintSizeControls({ mode, custom, source, language, onMode, onSize }: {
  mode: InpaintSizeMode; custom: InpaintSize; source: InpaintSize | null; language?: string;
  onMode: (mode: InpaintSizeMode) => void; onSize: (size: InpaintSize) => void;
}) {
  const text = inpaintSizeText(language);
  let output: InpaintSize | undefined, error = '';
  if (source) { try { output = inpaintSizePlan(mode, custom, source, null, language).outputSize; } catch (e) { error = (e as Error).message; } }
  return <div className="field inpaint-size-controls">
    <span>{text.title}</span>
    <div className="mode-buttons" role="group" aria-label={text.title}>
      <button type="button" className={`btn ${mode === 'original' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={mode === 'original'} onClick={() => onMode('original')}>{text.original}</button>
      <button type="button" className={`btn ${mode === 'custom' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={mode === 'custom'} onClick={() => onMode('custom')}>{text.custom}</button>
    </div>
    {mode === 'custom' && <ResolutionPicker width={custom.width} height={custom.height} language={language} onChange={onSize} maxDimension={1600}>
     <div className="dimension-inputs">
      <label>{text.width}<input data-testid="inpaint-width" type="number" min={64} max={1600} step={64} value={custom.width || ''} onChange={e => onSize({ ...custom, width: Number(e.target.value) })}/></label>
      <span>×</span>
      <label>{text.height}<input data-testid="inpaint-height" type="number" min={64} max={1600} step={64} value={custom.height || ''} onChange={e => onSize({ ...custom, height: Number(e.target.value) })}/></label>
     </div>
    </ResolutionPicker>}
    <small className="field-hint">{source ? `${text.output}: ${output ? `${output.width}×${output.height}` : '—'}` : text.missing}</small>
    <small className="field-hint">{text.rule}</small>
    {error && <small role="alert" className="field-hint warning">{error}</small>}
  </div>;
}
