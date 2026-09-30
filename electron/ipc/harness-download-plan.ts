import {isNewerBundle} from './harness-policy';
import type {HarnessSnapshot} from '../../src/harness-types';
import type {HarnessDownload} from './harness-update';
import type {HarnessDownloadConsent} from './harness-download-consent';

type Options={
 kind:'component'|'official';reinstall:boolean;installed:HarnessSnapshot;
 checkOfficial:()=>Promise<HarnessSnapshot['updateInfo']>;
 query:()=>Promise<HarnessDownload|null>;consent:HarnessDownloadConsent;
 queryOfficial?:(version:string)=>Promise<{token:string;version:string;bytes:number;official?:boolean}>;
};
/** Metadata only: approval and verified bundle compatibility remain separate steps. */
export async function planHarnessDownload({kind,reinstall,installed,checkOfficial,query,consent,queryOfficial}:Options) {
 const stop=(status:'current'|'blocked',message:string)=>({[status]:true,message,token:'',version:installed.version??'',bytes:0});
 let official:string|undefined;
 if(kind==='official'){
  const info=await checkOfficial();
  if(!info?.official||info.officialFailed)throw Error('检查失败，请重试');
  official=info.official;
  if(!installed.version||!installed.installedUpstream)return stop('blocked','请先安装 Studio 适配组件，再检查 Harness 官方更新。');
  if(!isNewerBundle(official,installed.installedUpstream))return stop('current','Harness 运行环境已是当前检测到的最新版本。');
  if(!queryOfficial)throw Error('官方独立更新入口未配置。');
  return queryOfficial(official);
 }
 const asset=await query();
 if(!asset)throw Error('暂无已发布的兼容组件。');
 if(!reinstall&&installed.version&&!isNewerBundle(asset.version,installed.version))return stop('current','Studio 适配组件已是当前检测到的最新版本。');
 // Explicit reinstall may reuse the same package, but must never downgrade it.
 if(installed.version&&isNewerBundle(installed.version,asset.version))return stop('blocked','已发布组件早于当前安装版本，保留当前组件。');
 return consent.issue(asset,kind,reinstall);
}
