import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import fs from 'node:fs';
import {InpaintSizeControls} from './components/InpaintSizeControls';
import {RESOLUTION_TIERS,RESOLUTION_RATIOS,resolutionForTier,resolutionSizeAllowed,resolutionPickerRatio} from './resolution-tiers';

const props={custom:{width:832,height:1216},source:{width:896,height:1152},language:'zh-CN',onMode:()=>{},onSize:()=>{}};
it('inpaint reuses both generation selectors, actual MP, and editable width/height',()=>{
 const html=renderToStaticMarkup(<InpaintSizeControls {...props} mode="custom"/>);
 expect(html.match(/aria-haspopup="listbox"/g)).toHaveLength(2);
 for(const text of ['总分辨率','画面比例','1 MP · 普通','2:3','1.012 MP','inpaint-width','inpaint-height'])expect(html).toContain(text);
});
it('original mode leaves source size independent and hides custom controls',()=>{
 const html=renderToStaticMarkup(<InpaintSizeControls {...props} mode="original"/>);
 expect(html).toContain('896×1152');expect(html).not.toContain('resolution-selectors');
 expect(html).not.toContain('inpaint-width');
});
it('tool limit does not cap the shared generation picker',()=>{
 const large=resolutionForTier(3,'1:1');expect(resolutionSizeAllowed(large)).toBe(true);
 expect(resolutionSizeAllowed(large,1600)).toBe(false);
 expect(resolutionSizeAllowed(resolutionForTier(1,'2:3'),1600)).toBe(true);
});
it('unfinished, non-finite or extreme inputs can recover through a preset',()=>{
 for(const size of [[0,0],[0,1216],[NaN,Infinity],[-1,1024],[64,100000]]) {
  const ratio=resolutionPickerRatio(size[0],size[1]);
  expect(()=>resolutionForTier(1,ratio)).not.toThrow();
  expect(resolutionSizeAllowed(resolutionForTier(1,ratio),1600)).toBe(true);
 }
 expect(resolutionPickerRatio(704,1408)).toBe('1:2');
});
it('desktop fixture records every tier/ratio for shared Android/iOS parity',()=>{
 const fixture=RESOLUTION_TIERS.flatMap(tier=>RESOLUTION_RATIOS.map(ratio=>({tier,ratio,...resolutionForTier(tier,ratio),allowedInpaint:resolutionSizeAllowed(resolutionForTier(tier,ratio),1600)})));
 if(process.env.RESOLUTION_PARITY_FILE)fs.writeFileSync(process.env.RESOLUTION_PARITY_FILE,JSON.stringify(fixture,null,2)+'\n');
 const saved=new URL('../mobile/test/fixtures/resolution-picker-desktop.json',import.meta.url);
 if(fs.existsSync(saved))expect(JSON.parse(fs.readFileSync(saved,'utf8'))).toEqual(fixture);
 expect(fixture).toHaveLength(65);
});
