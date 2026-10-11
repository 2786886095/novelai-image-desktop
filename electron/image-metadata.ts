import sharp from 'sharp';
import {inspectImageMetadata,parseImageMetaAsync} from '../src/png-meta';
import {MAX_METADATA_IMAGE_PIXELS} from '../src/image-metadata-pixels';
import type {LoadImageResult} from '../src/types';

/** Native pixel fallback shared by the workbench and the agent metadata tool. */
export async function readNativeImageMetadata(buffer: Uint8Array): Promise<Record<string, string>> {
  try {
    const bytes=Uint8Array.from(buffer);
    const metadata=await parseImageMetaAsync(bytes.buffer,async(input)=>{
      const {data,info}=await sharp(input,{limitInputPixels:MAX_METADATA_IMAGE_PIXELS,page:0,pages:1})
        .toColourspace('srgb').ensureAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
      return {data:new Uint8Array(data.buffer,data.byteOffset,data.byteLength),width:info.width,height:info.height,channels:info.channels};
    });
    return metadata;
  } catch {return {};}
}

/** Metadata is optional and must not prevent a damaged image from being opened. */
export async function extractEmbeddedImageMetadata(buffer: Uint8Array): Promise<LoadImageResult['metadata']|undefined> {
  try {
    const report=inspectImageMetadata(await readNativeImageMetadata(buffer));
    if(!Object.keys(report.imported).length&&!report.characterCaptions.length) return undefined;
    return {imported:report.imported,characterCaptions:report.characterCaptions};
  } catch {return undefined;}
}
