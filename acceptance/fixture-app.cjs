const path=require('path'),electron=require('electron');
// Only hide the isolated acceptance window; do not touch the user's running app.
electron.BrowserWindow.prototype.show=function(){};
// The application's offscreen capture normally quits after five seconds.
// Keep this isolated acceptance process alive until the driver terminates it.
electron.app.quit=function(){};
global.fetch=async()=>{throw Error('External network disabled in neutral UI fixture');};
const S=path.resolve(process.argv[2]),req=require('module').createRequire(path.join(S,'package.json'));
const axios=req('axios');axios.get=async()=>{throw Error('External network disabled in neutral UI fixture');};axios.post=axios.get;
require(path.join(S,'dist-electron/electron/bootstrap.js'));
