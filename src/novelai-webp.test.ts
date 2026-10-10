import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {parseImageMeta,inspectImageMetadata} from './png-meta';
import {extractEmbeddedGenerationMetadata} from '../electron/ipc/nai';

const load=(name:string)=>Uint8Array.from(fs.readFileSync('shared/image-input-fixtures/'+name)).buffer;
describe('official NovelAI WebP EXIF field mapping',()=>{
  for(const name of ['novelai-exif-v5.webp','novelai-exif-v5-be.webp','novelai-exif-paired.png'])it(name,()=>{
    const bytes=load(name),before=Uint8Array.from(new Uint8Array(bytes));
    const meta=parseImageMeta(bytes),report=inspectImageMetadata(meta);
    console.log('WEBP_BEHAVIOR',JSON.stringify({name,kind:report.kind,prompt:report.imported.positivePrompt??null,seed:report.imported.seed??null,characters:report.characterCaptions.length}));
    expect(report.kind).toBe('novelai');
    expect(report.imported).toMatchObject({positivePrompt:'1girl, blue sky',negativePrompt:'lowres, bad hands',seed:4000000000,seedMode:'fixed',model:'nai-diffusion-5-full',steps:28});
    expect(report.characterCaptions).toEqual([{prompt:'girl, blue hair',negativePrompt:'bad face',useCoords:true,x:0.25,y:0.75}]);
    expect(extractEmbeddedGenerationMetadata(Buffer.from(bytes))?.imported.seed).toBe(4000000000);
    expect(new Uint8Array(bytes)).toEqual(before);
  });
  it('does not read TIFF values outside the EXIF chunk',()=>{
    const bytes=new Uint8Array(load('novelai-exif-v5.webp'));
    const marker=Buffer.from(bytes).indexOf('EXIF');
    const truncated=bytes.slice();new DataView(truncated.buffer).setUint32(marker+4,8,true);
    expect(inspectImageMetadata(parseImageMeta(truncated.buffer)).imported.seed).toBeUndefined();
  });
  it('rejects truncated RIFF metadata without throwing',()=>{
    const bytes=load('novelai-exif-v5.webp');
    expect(()=>parseImageMeta(bytes.slice(0,bytes.byteLength-10))).not.toThrow();
    expect(inspectImageMetadata(parseImageMeta(bytes.slice(0,bytes.byteLength-10))).imported.seed).toBeUndefined();
  });
});
