import { expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { prepareFocusedInpaintInput, compositeFocusedPatch } from './focused-inpaint';
import { inpaintSizePlan } from '../../src/inpaint-size';
import { prepareInpaintAssets } from './nai';
function solid(width: number, height: number, r: number) { const p = new PNG({ width, height }); for (let i=0;i<p.data.length;i+=4) { p.data[i]=r;p.data[i+3]=255; } return p; }
it('original/custom requests scale image and mask together and preserve unpainted pixels', () => {
  const source = solid(128,128,40),mask=solid(128,128,0);
  for(let y=32;y<96;y++)for(let x=32;x<96;x++)mask.data[(y*128+x)*4]=255;
  const region={x:16,y:16,width:96,height:96},target={width:256,height:128};
  const resize=(data:Buffer,w:number,h:number)=>{const p=PNG.sync.read(data),out=new PNG({width:w,height:h});for(let y=0;y<h;y++)for(let x=0;x<w;x++){const from=(Math.floor(y*p.height/h)*p.width+Math.floor(x*p.width/w))*4;p.data.copy(out.data,(y*w+x)*4,from,from+4);}return PNG.sync.write(out);};
  const prepared=prepareFocusedInpaintInput(PNG.sync.write(source),PNG.sync.write(mask),region,target,resize);
  expect([prepared.source.width,prepared.source.height]).toEqual([256,128]);
  expect([prepared.mask.width,prepared.mask.height]).toEqual([256,128]);
  expect(prepared.size).toEqual(inpaintSizePlan('custom',target,source,region).requestSize);
  const patch=solid(prepared.region.width,prepared.region.height,200);
  const out=PNG.sync.read(compositeFocusedPatch(PNG.sync.write(patch),prepared,resize));
  expect([out.width,out.height]).toEqual([256,128]);
  expect(out.data[0]).toBe(40);expect(out.data[(64*256+128)*4]).toBe(200);
  const full=prepareInpaintAssets(PNG.sync.write(source),PNG.sync.write(mask).toString('base64'),target);
  expect([PNG.sync.read(Buffer.from(full.imageBase64,'base64')).width,PNG.sync.read(Buffer.from(full.maskBase64,'base64')).width]).toEqual([256,256]);
});
