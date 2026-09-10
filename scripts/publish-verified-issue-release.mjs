// Manual workflow only. Publication and issue closure happen after all build jobs pass.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const call=(command,args)=>execFileSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024}).trim();
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
if(version!=='2.2.9')throw Error('This issue-batch publication script is version-specific');
const tag='v'+version, sha=call('git',['rev-parse','HEAD']);
const buildRun=process.env.BUILD_RUN;
if(!/^\d+$/.test(buildRun??''))throw Error('A verified desktop build run is required');
const build=JSON.parse(call('gh',['run','view',buildRun,'--json','headSha,jobs']));
const desktopJobs=build.jobs.filter(job=>job.name.startsWith('build ('));
if(desktopJobs.length!==3||desktopJobs.some(job=>job.conclusion!=='success')||!build.jobs.some(job=>job.name==='mac-intel-smoke'&&job.conclusion==='success'))throw Error('All desktop builds and native Intel verification must pass');
// Retry only the publication tooling: installers must match every application file.
call('git',['diff','--exit-code',build.headSha,sha,'--','.',':!scripts/publish-verified-issue-release.mjs',':!.github/workflows/build.yml']);
const mobileRun=process.env.MOBILE_RUN;
if(!/^\d+$/.test(mobileRun??''))throw Error('A verified mobile workflow run is required');
const mobile=JSON.parse(call('gh',['run','view',mobileRun,'--json','status,conclusion,headSha,jobs']));
if(mobile.status!=='completed'||mobile.conclusion!=='success'||['android','ios'].some(name=>!mobile.jobs.some(job=>job.name===name&&job.conclusion==='success')))throw Error('Both mobile jobs must succeed');
call('git',['diff','--exit-code',mobile.headSha,sha,'--','mobile']);
call('gh',['run','download',mobileRun,'-n','novelai-mobile-android-apk','-D','mobile-assets/android']);
call('gh',['run','download',mobileRun,'-n','novelai-mobile-ios-ipa-unsigned','-D','mobile-assets/ios']);
const desktop=['Langbai-NovelAI-Studio-Setup-2.2.9.exe','Langbai-NovelAI-Studio-2.2.9.exe','Langbai-NovelAI-Studio-2.2.9-universal.dmg','Langbai-NovelAI-Studio-2.2.9.zip','Langbai-NovelAI-Studio-2.2.9.AppImage','latest.yml'].map(name=>path.join('release-assets',name));
const apk='mobile-assets/android/app-release.apk',ipa='mobile-assets/ios/novelai-mobile-unsigned.ipa';
const files=[...desktop,apk,ipa];
for(const file of files)if(!fs.existsSync(file)||fs.statSync(file).size===0)throw Error('Missing asset '+file);
const updater=fs.readFileSync('release-assets/latest.yml','utf8');
const field=name=>updater.match(new RegExp('^'+name+':\\s*(.+)$','m'))?.[1].trim().replace(/^['"]|['"]$/g,'');
if(field('version')!==version||field('path')!==path.basename(desktop[0]))throw Error('Updater version/path mismatch');
const hash=crypto.createHash('sha512').update(fs.readFileSync(desktop[0])).digest('base64');
if(field('sha512')!==hash)throw Error('Updater installer hash mismatch');
const sdk=process.env.ANDROID_HOME??process.env.ANDROID_SDK_ROOT;
if(!sdk)throw Error('Android SDK required for signature verification');
const buildTools=path.join(sdk,'build-tools');
const tools=fs.readdirSync(buildTools).filter(name=>/^\d+(\.\d+)+$/.test(name)).sort((a,b)=>a==='35.0.0'?-1:b==='35.0.0'?1:b.localeCompare(a,undefined,{numeric:true})).map(name=>path.join(buildTools,name)).find(dir=>fs.existsSync(path.join(dir,'apksigner')));
if(!tools)throw Error('Android signing verification tools missing');
call('gh',['release','download','v2.2.5','-p','app-release.apk','-D','previous-android']);
console.log('APK_VERIFIER',tools);
const certificate=file=>{
 const output=call(path.join(tools,'apksigner'),['verify','--print-certs',file]);
 const digest=output.match(/Signer #1 certificate SHA-256 digest:\s*([a-f0-9]{64})\b/i)?.[1]?.toLowerCase();
 if(!digest)throw Error('APK certificate output was not recognized: '+output.slice(0,1200));
 console.log('APK_CERTIFICATE',file,digest);
 return digest;
};
const signingHash=certificate(apk);
if(!signingHash||signingHash!==certificate('previous-android/app-release.apk'))throw Error('APK signing key changed; in-place upgrade would fail');
const badging=file=>call(path.join(tools,'aapt'),['dump','badging',file]);
const current=badging(apk),previous=badging('previous-android/app-release.apk');
const code=text=>Number(text.match(/versionCode='(\d+)'/)?.[1]);
if(!current.includes(`versionName='${version}'`)||!(code(current)>code(previous)))throw Error('APK version does not upgrade previous release');
const iosVersion=call('python3',['-c',"import zipfile,plistlib,sys;z=zipfile.ZipFile(sys.argv[1]);print(plistlib.loads(z.read('Payload/Runner.app/Info.plist'))['CFBundleShortVersionString'])",ipa]);
if(iosVersion!==version)throw Error('iOS bundle version mismatch');
const existing=spawnSync('gh',['release','view',tag],{encoding:'utf8',timeout:30000});
if(existing.status===0)throw Error('Release already exists; do not overwrite it');
if(!/not found/i.test(existing.stderr??''))throw Error('Release existence check failed: '+existing.stderr);
const evidence={version,sha,buildRun,desktopSourceSha:build.headSha,mobileRun,mobileSourceSha:mobile.headSha,signingHash,assets:files.map(file=>({name:path.basename(file),size:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))};
fs.writeFileSync('release-assets/verification.json',JSON.stringify(evidence,null,2));
call('gh',['release','create',tag,...files,'release-assets/verification.json','--target',sha,'--draft','--title',`Langbai NovelAI Studio ${tag}`,'--notes-file','docs/RELEASE_NOTES.md']);
const draft=JSON.parse(call('gh',['release','view',tag,'--json','isDraft,assets']));
if(!draft.isDraft||files.some(file=>!draft.assets.some(asset=>asset.name===path.basename(file)&&asset.size===fs.statSync(file).size)))throw Error('Draft asset verification failed');
call('gh',['release','edit',tag,'--draft=false','--latest']);
const published=JSON.parse(call('gh',['release','view',tag,'--json','isDraft,url,assets']));
if(published.isDraft||files.some(file=>!published.assets.some(asset=>asset.name===path.basename(file))))throw Error('Publication readback failed');
const changes={
  6:'接口地址已增加说明及操作路径规范化，保留自定义代理前缀。',
  7:'已复核现有原数据/种子导入修复，并纳入本次回归测试。',
  8:'电脑和手机端均已加入角色提示词预设保存、应用、重命名和删除。',
  10:'历史图片删除增加二次确认；大图支持方向键和前后切换。',
  11:'已保存风格预设支持重命名，保留提示词、ID 和参考图。',
  12:'修复原生库打包/解包规则。Linux 安装包内 sharp/libvips、ONNX 加载及实际启动检查通过。',
  13:'角色正负面提示词及位置参数已持久化；电脑和手机端均有保存/重载回归测试。',
  14:'评分模型下载改走 AI 代理，并在生成前准备模型；真实 DINO 轻量/高精度加载和评分调用通过，安装包也验证原生依赖。',
  15:'新增自定义画师候选库，支持逗号、换行及 {artist:xxx} 形式，不混入排行榜并保留配置。',
  16:'风格参考图增加从历史选择入口，复用独立复制逻辑，不必先打开文件目录。',
  17:'收藏可全选或部分选择后批量转为独立风格预设，逐项命名并复制参考图；原收藏保留。',
  18:'电脑端大图支持左键平移与方向键连续切换，手机端统一大图前后切换和缩放，覆盖图库、酒馆、抽卡、漫画和预设入口。',
};
for(const [number,change] of Object.entries(changes)){
 call('gh',['issue','close',number,'--reason','completed','--comment',`${tag} 已发布：${published.url}\n\n${change}\n\n本次经过桌面/Flutter 回归与跨平台构建检查；Windows、Linux、macOS 原生安装包有加载与启动验收。iOS 附件为无签名测试包。若更新后仍复现，请附系统、版本和具体复现步骤，便于继续定位。`]);
 const issue=JSON.parse(call('gh',['issue','view',number,'--json','state']));
 if(issue.state!=='CLOSED')throw Error('Issue closure readback failed: '+number);
}
console.log('VERIFIED_RELEASE_PUBLISHED_AND_12_ISSUES_CLOSED',published.url);
