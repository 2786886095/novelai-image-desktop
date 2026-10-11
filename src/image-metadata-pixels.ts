export const MAX_METADATA_IMAGE_BYTES = 64 * 1024 * 1024;
export const MAX_METADATA_IMAGE_PIXELS = 16 * 1024 * 1024;
export type DecodedMetadataPixels = {data: Uint8Array; width: number; height: number; channels: number};
export type MetadataPixelDecoder = (bytes: Uint8Array) => Promise<DecodedMetadataPixels | null>;

/** Sniff actual file bytes, not an extension or MIME label, before allocating pixels. */
export function metadataImageHeader(bytes: Uint8Array): {width: number; height: number; kind: 'png'|'webp'} | null {
  if (bytes.length < 33 || bytes.length > MAX_METADATA_IMAGE_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, kind: 'png'|'webp';
  if ([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)) {
    if (view.getUint32(8)!==13 || view.getUint32(12)!==0x49484452) return null;
    width=view.getUint32(16); height=view.getUint32(20); kind='png';
  } else if (view.getUint32(0)===0x52494646 && view.getUint32(8)===0x57454250) {
    kind='webp'; const end=view.getUint32(4,true)+8;
    if (end>bytes.length || end<12) return null;
    let offset=12;
    while (offset+8<=end) {
      const type=view.getUint32(offset), length=view.getUint32(offset+4,true), start=offset+8;
      if (start+length> end || start+length+(length&1)>end) return null;
      if (type===0x56503858 && length>=10) {
        width=1+bytes[start+4]+bytes[start+5]*256+bytes[start+6]*65536;
        height=1+bytes[start+7]+bytes[start+8]*256+bytes[start+9]*65536;
      } else if (!width && type===0x5650384c && length>=5 && bytes[start]===0x2f) {
        const bits=view.getUint32(start+1,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;
      } else if (!width && type===0x56503820 && length>=10 && bytes[start+3]===0x9d && bytes[start+4]===1 && bytes[start+5]===0x2a) {
        width=view.getUint16(start+6,true)&0x3fff;height=view.getUint16(start+8,true)&0x3fff;
      }
      offset=start+length+(length&1);
    }
    if (offset!==end) return null;
  } else return null;
  if (!width || !height || width*height<152 || width*height>MAX_METADATA_IMAGE_PIXELS) return null;
  return {width,height,kind};
}

/** Avoid decoding optional compressed text/ICC chunks a second time in the pixel codec. */
export function metadataPixelBytes(bytes: Uint8Array): Uint8Array {
  const header=metadataImageHeader(bytes);
  if (!header || header.kind!=='png') return bytes;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const chunks=[bytes.subarray(0,8)];let size=8,offset=8,ended=false;
  while (offset+12<=bytes.length) {
    const length=view.getUint32(offset),end=offset+length+12;
    if (end>bytes.length) throw new Error('Truncated PNG pixels');
    const type=view.getUint32(offset+4);
    if ([0x49484452,0x49444154,0x49454e44,0x504c5445,0x74524e53].includes(type)) {
      chunks.push(bytes.subarray(offset,end));size+=end-offset;
    }
    offset=end;if(type===0x49454e44){ended=true;break;}
  }
  if(!ended) throw new Error('Incomplete PNG pixels');
  const result=new Uint8Array(size);let pos=0;for(const c of chunks){result.set(c,pos);pos+=c.length;}
  return result;
}

/** Alpha is read exactly; RGB canvas premultiplication is irrelevant to the alpha LSB. */
export const decodeBrowserMetadataPixels: MetadataPixelDecoder = async (bytes) => {
  const header=metadataImageHeader(bytes);if(!header || typeof createImageBitmap!=='function') return null;
  const bitmap=await createImageBitmap(new Blob([Uint8Array.from(bytes)],{type:header.kind==='png'?'image/png':'image/webp'}),
    {premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
  try {
    if(bitmap.width!==header.width || bitmap.height!==header.height) return null;
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(bitmap.width,bitmap.height):document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d',{willReadFrequently:true}) as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null;
    if(!context) return null;
    context.drawImage(bitmap,0,0);
    const pixels=context.getImageData(0,0,bitmap.width,bitmap.height);
    return {data:new Uint8Array(pixels.data.buffer,pixels.data.byteOffset,pixels.data.byteLength),width:bitmap.width,height:bitmap.height,channels:4};
  } finally {bitmap.close();}
};
