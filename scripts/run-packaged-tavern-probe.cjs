// Electron is a Windows GUI executable. Obtain its real exit code from the
// child-process handle instead of PowerShell's unset/stale $LASTEXITCODE.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=process.cwd();
const command=[path.resolve('release/win-unpacked/Langbai NovelAI Studio.exe'),path.resolve('scripts/packaged-tavern-defaults-probe.cjs'),path.resolve('release/win-unpacked/resources/app.asar'),'使用酒馆'];
const result=spawnSync(command[0],command.slice(1),{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',windowsHide:true,timeout:90000});
const event={event:'command_execution',command,cwd:root,environment:{ELECTRON_RUN_AS_NODE:'1'},stdout:result.stdout??'',stderr:result.stderr??'',exit:result.status,error:result.error?.message??null};
fs.mkdirSync('release/packaged-smoke',{recursive:true});
fs.writeFileSync('release/packaged-smoke/tavern-defaults.json',JSON.stringify(event,null,2));
process.stdout.write(event.stdout);process.stderr.write(event.stderr);
if(event.error)process.stderr.write(event.error+'\n');
process.exit(event.exit??1);
