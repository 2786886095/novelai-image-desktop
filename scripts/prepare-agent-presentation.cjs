// Rebuild source-owned web assets before every distribution, never reuse a
// checked-in client bundle just because it exists. Errors stop packaging.
const path=require('node:path');
const {execFileSync}=require('node:child_process');
function prepareAgentPresentation(projectDir=path.resolve(__dirname,'..')) {
  for(const script of ['harness/build-library.mjs','harness/build-responsive.mjs','harness/build-brand.mjs']) {
    execFileSync(process.execPath,[path.join(projectDir,script)],{
      cwd:projectDir,windowsHide:true,timeout:120000,stdio:'inherit',
    });
  }
}
module.exports=prepareAgentPresentation;
if(require.main===module)prepareAgentPresentation();
