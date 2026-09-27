import {describe, it, expect} from 'vitest';
import {planUpscale} from './upscale-plan';
import {maxNAIEnhanceSize, NAI_MAX_PIXEL_AREA} from './nai-dimensions';
import {calculateUpscaleAnlas} from './anlas';

describe('MAX sizing and each paid upscale pass', () => {
  it('preserves ordinary 2x input, including dimensions outside a 16px grid', () => {
    expect(planUpscale(832,1216,2)).toMatchObject({inputWidth:832,inputHeight:1216,width:1664,height:2432,resized:false});
    expect(planUpscale(833,1217,2)).toMatchObject({inputWidth:833,inputHeight:1217,width:1666,height:2434,resized:false});
  });
  it('aligns the reported 832x1216 MAX case before either paid pass', () => {
    const p = planUpscale(832,1216,'max');
    expect(p).toMatchObject({inputWidth:688,inputHeight:1024,width:2752,height:4096,passes:2,exceedsLimit:false});
    expect(p.inputWidth % 16).toBe(0);
    expect(p.inputHeight % 16).toBe(0);
  });
  it('rejects fractional, zero and non-finite source dimensions', () => {
    for(const w of [NaN,Infinity,0,832.5]) expect(()=>planUpscale(w,1216,2)).toThrow();
  });
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
