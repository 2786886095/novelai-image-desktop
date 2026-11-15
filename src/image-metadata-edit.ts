import { MAX_METADATA_IMAGE_BYTES, decodeBrowserMetadataPixels, metadataImageHeader } from "./image-metadata-pixels";

export type MetadataEdit = {kind:"remove"} | {kind:"novelai"|"sd"; text:string};
const textEncoder=new TextEncoder();
const chars=(b:Uint8Array)=>String.fromCharCode(...b);
const signature=Uint8Array.of(137,80,78,71,13,10,26,10);
const table=Uint32Array.from({length:256},(_,i)=>{
  let n=i; for(let k=0;k<8;k++)n=(n>>>1)^((n&1)?0xedb88320:0); return n;
});
function concat(parts:Uint8Array[]):Uint8Array<ArrayBuffer>{
  const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;
  for(const p of parts){result.set(p,o);o+=p.length;}return result;
}
function chunk(type:string,data:Uint8Array){
  const out=new Uint8Array(data.length+12), view=new DataView(out.buffer);
  view.setUint32(0,data.length);out.set(textEncoder.encode(type),4);out.set(data,8);
  let crc=0xffffffff;for(let i=4;i<out.length-4;i++)crc=(crc>>>8)^table[(crc^out[i])&255];
  view.setUint32(out.length-4,crc^0xffffffff);return out;
}
function internationalText(key:string,value:string){
  return chunk("iTXt",concat([textEncoder.encode(key),Uint8Array.of(0,0,0,0,0),textEncoder.encode(value)]));
}
export function editedMetadata(edit:MetadataEdit):Record<string,string>{
  if(edit.kind==="remove")return {};
  if(!edit.text.trim() || textEncoder.encode(edit.text).length>1024*1024)throw Error("Metadata must be between 1 byte and 1 MiB");
  if(edit.kind==="sd")return {parameters:edit.text};
  if(edit.kind!=="novelai")throw Error("Unsupported generation metadata format");
  const parsed:unknown=JSON.parse(edit.text);
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed))throw Error("NovelAI Comment must be a JSON object");
  const value=parsed as Record<string,unknown>;
  const prompt=typeof value.prompt==="string"?value.prompt:undefined;
  return {Software:"NovelAI",Comment:JSON.stringify(value),...(prompt!==undefined?{Description:prompt}:{})};
}
function validateStaticImage(bytes:Uint8Array,kind:"png"|"webp"){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let pos=kind==="png"?8:12, foundEnd=kind==="webp";
  const min=kind==="png"?12:8;
  while(pos+min<=bytes.length){
    const name=chars(bytes.subarray(pos+(kind==="png"?4:0),pos+(kind==="png"?8:4)));
    const n=view.getUint32(pos+(kind==="png"?0:4),kind==="webp");
    if(["acTL","fcTL","fdAT","ANIM","ANMF"].includes(name))throw Error("Animated images are not supported");
    pos+=n+min+(kind==="webp"?(n&1):0);
    if(pos>bytes.length)throw Error("Truncated image");
    if(name==="IEND"){foundEnd=true;break;}
  }
  if(!foundEnd||pos>bytes.length)throw Error("Incomplete image");
}
function eraseKnownCarriers(pixels:Uint8Array,width:number,height:number){
  const total=width*height;
  // Known alpha/RGB stealth encodings have a 15-byte signature, then a
  // big-endian bit count. Clear the data as well as the signature.
  for(const channels of [[3],[0,1,2]])for(const columnMajor of [true,false]){
    const offset=(bit:number)=>{
      const px=Math.floor(bit/channels.length);
      const index=columnMajor?(px%height)*width+Math.floor(px/height):px;
      return index*4+channels[bit%channels.length];
    };
    const capacity=total*channels.length;
    if(capacity<152)continue;
    const read=(at:number,n:number)=>{let value=0;for(let i=0;i<n;i++)value=value*2+(pixels[offset(at+i)]&1);return value;};
    const magic=String.fromCharCode(...Array.from({length:15},(_,i)=>read(i*8,8)));
    if(!/^stealth_(?:png|rgb)(?:info|comp)$/.test(magic))continue;
    const bits=read(120,32), end=bits>0&&bits<=capacity-152?152+bits:capacity;
    for(let b=0;b<end;b++)pixels[offset(b)]&=254;
  }
}
export async function rewriteGenerationMetadata(bytes:Uint8Array, edit:MetadataEdit, decode=(bytes:Uint8Array)=>decodeBrowserMetadataPixels(bytes,1)):Promise<Uint8Array<ArrayBuffer>>{
  const metadata=editedMetadata(edit);
  if(bytes.byteLength>MAX_METADATA_IMAGE_BYTES)throw Error("Image exceeds 64 MiB");
  const header=metadataImageHeader(bytes,1);
  if(!header)throw Error("Only static PNG / WebP within the supported size is accepted");
  validateStaticImage(bytes,header.kind);
  const decoded=await decode(bytes);
  if(!decoded||decoded.channels!==4||decoded.width!==header.width||decoded.height!==header.height||
      decoded.data.length!==header.width*header.height*4)throw Error("Could not decode the original image");
  const {width,height}=header;
  const pixels=Uint8Array.from(decoded.data);
  eraseKnownCarriers(pixels,width,height);
  const scan=new Uint8Array((width*4+1)*height);
  for(let row=0;row<height;row++)scan.set(pixels.subarray(row*width*4,(row+1)*width*4),row*(width*4+1)+1);
  const zipped=await new Response(new Blob([scan]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
  const ihdr=new Uint8Array(13), v=new DataView(ihdr.buffer);
  v.setUint32(0,width);v.setUint32(4,height);ihdr[8]=8;ihdr[9]=6;
  return concat([signature,chunk("IHDR",ihdr),...Object.entries(metadata).map(([k,x])=>internationalText(k,x)),chunk("IDAT",new Uint8Array(zipped)),chunk("IEND",new Uint8Array())]);
}
