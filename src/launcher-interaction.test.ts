import {expect,it} from 'vitest';import {readFileSync} from 'node:fs';
const app=readFileSync('src/App.tsx','utf8'),controls=readFileSync('src/components/CompactPromptControls.tsx','utf8');
it('toolbar collapses to a right-hand expansion button',()=>expect(app).toContain('<SlidingPromptToolbar'));
it('prompt editor exposes a dedicated vertical resize handle',()=>expect(app).toContain('<PromptResizeHandle'));
it('removes redundant autocomplete instructions',()=>expect(app).not.toContain('className="prompt-helper"'));
it('quality controls remain only inside advanced parameters',()=>expect(app).not.toContain('<QualityAndTransparencyControls />'));
it('resolution uses MP and ratio themed selectors',()=>{expect(controls).toContain('resolutionForTier');expect(controls).toContain('ariaLabel={labels.ratio}');});

it('width and height inputs always render, without a custom-mode gate',()=>{expect(controls).toContain('<div className="compact-custom-size">{children}</div>');expect(controls).not.toContain("custom||selected");expect(app).toContain('snapNAIDimensionWithinArea');});
