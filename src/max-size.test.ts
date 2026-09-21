import {describe, it, expect} from 'vitest';
import {planUpscale} from './upscale-plan';
import {maxNAIEnhanceSize, NAI_MAX_PIXEL_AREA} from './nai-dimensions';
import {calculateUpscaleAnlas} from './anlas';

describe('MAX sizing and each paid upscale pass', () => {
  it('keeps MAX requests within input area and output side limits', () => {
    for (const [w,h] of [[832,1216],[1024,1024],[500,500],[8000,6000],[100,20000],[20000,100]]) {
      const p = planUpscale(w,h,'max');
      expect(p.exceedsLimit).toBe(false);
      expect(p.width).toBeLessThanOrEqual(4096);
      expect(p.height).toBeLessThanOrEqual(4096);
      for(let i=0;i<p.passes;i++) expect(p.inputWidth*p.inputHeight*4**i).toBeLessThanOrEqual(3145728);
      expect(Math.abs(p.width / p.height - w / h)).toBeLessThan(w/h * .08 + .01);
    }
  });
  it('stops 4x before the second request would exceed the input limit', () => {
    expect(planUpscale(832,1216,4).exceedsLimit).toBe(true);
    expect(planUpscale(1024,1024,4).exceedsLimit).toBe(true);
    expect(planUpscale(512,512,4).exceedsLimit).toBe(false);
    expect(calculateUpscaleAnlas({image:{width:1024,height:1024},scale:4}).ok).toBe(false);
  });
  it('quotes each pass separately, rather than doubling first-pass cost', () => {
    expect(calculateUpscaleAnlas({image:{width:800,height:800},scale:4}).amount).toBe(5);
  });
  it('matches official upscaled_enhance size calculation', () => {
    const size = maxNAIEnhanceSize(832,1216);
    expect(size).toEqual({width:1467,height:2144});
    expect(size.width*size.height).toBeLessThanOrEqual(NAI_MAX_PIXEL_AREA);
  });
});
