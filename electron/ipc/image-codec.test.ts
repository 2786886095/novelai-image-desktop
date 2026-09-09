import {describe,it,expect} from "vitest";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import {processableImage,validateImage,isWebp} from "./image-codec";

describe('WebP processing boundary',()=>{
  for (const name of ['lossy','lossless','alpha','animated']) it(`decodes ${name} WebP to a complete static PNG`,async()=>{
    const input=fs.readFileSync(path.resolve('shared/image-input-fixtures',name+'.webp'));
    const before=Buffer.from(input),output=await processableImage(input);
    const meta=await sharp(output).metadata();
    expect(meta.format).toBe('png');expect([meta.width,meta.height]).toEqual([96,64]);
    expect(await validateImage(input)).toMatchObject({width:96,height:64,extension:'webp'});
    expect(input).toEqual(before);expect(isWebp(output)).toBe(false);
    if(name==='alpha') expect((await sharp(output).stats()).isOpaque).toBe(false);
  });
  it('rejects corrupt WebP and preserves already processable bytes',async()=>{
    const corrupt=Buffer.from('RIFF0000WEBPinvalid');
    await expect(processableImage(corrupt)).rejects.toThrow();
    await expect(validateImage(corrupt)).rejects.toThrow();
    const png=await sharp({create:{width:2,height:2,channels:4,background:'white'}}).png().toBuffer();
    expect(await processableImage(png)).toBe(png);
  });
});
