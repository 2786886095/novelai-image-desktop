import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {InpaintSizeControls} from './components/InpaintSizeControls';

const props={custom:{width:704,height:1408},source:{width:3840,height:2160},language:'zh-CN',onMode:()=>{},onSize:()=>{},region:{x:256,y:256,width:256,height:256}};
it('shows the original 4K output and a separate focused work size without an invalid canvas warning',()=>{
 const html=renderToStaticMarkup(<InpaintSizeControls {...(props as any)} mode="original"/>);
 expect(html).toContain('3840×2160');expect(html).toContain('1024×1024');
 expect(html).toContain('选区工作尺寸');expect(html).not.toContain('role="alert"');
 expect(html).not.toContain('不会自动修改尺寸');
});
it('focused mode overrides final-size presentation without destroying saved custom values',()=>{
 const html=renderToStaticMarkup(<InpaintSizeControls {...(props as any)} mode="custom"/>);
 expect(html).toContain('3840×2160');expect(html).not.toContain('inpaint-width');
 expect(html).toMatch(/disabled=""[^>]*>自定义尺寸/);
 expect(props.custom).toEqual({width:704,height:1408});
});
it('distinguishes retained canvas and work crop for any saved language value',()=>{
 const html=renderToStaticMarkup(<InpaintSizeControls {...(props as any)} mode="original" language="en-US"/>);expect(html).toContain('选区工作尺寸');
 expect(html).toContain('3840×2160');expect(html).toContain('1024×1024');expect(html).not.toContain('role="alert"');
});
it('still presents ordinary custom output dimensions when focused mode is absent',()=>{
 const html=renderToStaticMarkup(<InpaintSizeControls {...props} region={null as any} mode="custom"/>);
 expect(html).toContain('704×1408');expect(html).toContain('inpaint-width');
});
