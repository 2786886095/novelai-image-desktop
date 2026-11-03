import fs from 'node:fs';
import path from 'node:path';

export function persistentProtocolExecutable(platform:NodeJS.Platform,execPath:string,portableFile:string|undefined,tempDir:string):string|undefined {
  const p=platform==='win32'?path.win32:path.posix;
  const candidate=portableFile||execPath;
  if(!p.isAbsolute(candidate)||/[\x00-\x1f]/.test(candidate))return;
  const relative=p.relative(p.resolve(tempDir),p.resolve(candidate));
  if(relative===''||(!relative.startsWith('..'+p.sep)&&relative!=='..'&&!p.isAbsolute(relative)))return;
  if(platform==='win32'&&!/\.exe$/i.test(candidate))return;
  return p.resolve(candidate);
}
export function registerRelayProtocol(app:{isPackaged:boolean;setAsDefaultProtocolClient:(scheme:string,path?:string,args?:string[])=>boolean},platform:NodeJS.Platform,execPath:string,portableFile:string|undefined,tempDir:string):boolean {
  if(!app.isPackaged)return false;
  const executable=persistentProtocolExecutable(platform,execPath,portableFile,tempDir);
  if(!executable||!fs.existsSync(executable))return false;
  const real=fs.realpathSync(executable);
  if(!persistentProtocolExecutable(platform,real,undefined,tempDir))return false;
  return app.setAsDefaultProtocolClient('langbai-novelai',real,[]);
}
