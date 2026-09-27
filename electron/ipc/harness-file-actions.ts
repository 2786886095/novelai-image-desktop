import fs from 'node:fs/promises';
import path from 'node:path';

// UI-only operation, never a model tool. Only existing Studio history images
// can be revealed; chat text is untrusted and is not a shell command or URL.
export function createFileActions(read:()=>Array<{filePath:string}>,reveal:(file:string)=>void){
  return async(request:{args:Record<string,unknown>})=>{
    try{
      const {action,filePath,...extra}=request.args;
      if(Object.keys(extra).length)throw Error('未知文件操作参数');
      if(action==='capabilities')return {ok:true,output:'支持打开本机图片所在文件夹',data:{reveal:true}};
      if(action!=='reveal'||typeof filePath!=='string'||filePath.length>4096||/[\x00-\x1f]/.test(filePath)||!path.isAbsolute(filePath))throw Error('请选择有效的本机生成图片');
      const requested=path.resolve(filePath);
      const item=read().find(item=>path.resolve(item.filePath)===requested);
      if(!item)throw Error('此文件不在本机生成历史中；未打开文件夹');
      const info=await fs.lstat(requested);
      if(!info.isFile()||info.isSymbolicLink())throw Error('图片已移动或不是普通文件');
      reveal(requested);
      return {ok:true,output:'已请求打开所在文件夹',data:{opened:true,filePath:requested}};
    }catch(error){return {ok:false,output:error instanceof Error?error.message:String(error)}}
  };
}
