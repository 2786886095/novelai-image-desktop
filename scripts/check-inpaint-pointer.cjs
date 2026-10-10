const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'); const path=require('node:path');
const source=process.env.POINTER_SOURCE ||= process.argv[2] || path.resolve(__dirname,'..');
process.env.POINTER_OUTPUT ||= fs.mkdtempSync(path.join(require('node:os').tmpdir(),'inpaint-pointer-fixture-'));
app.setPath('userData',path.join(process.env.POINTER_OUTPUT,'profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 setTimeout(()=>{console.error('FIXTURE_WATCHDOG');app.exit(2)},20000);

 const win=new BrowserWindow({show:false,width:900,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false,offscreen:true}});
 win.webContents.on('console-message',(_e,...args)=>console.error('RENDERER',...args));
 await win.loadFile(path.join(__dirname,'inpaint-pointer-fixture.html'));
 const wait=()=>new Promise(r=>setTimeout(r,70));
 const js=(code)=>win.webContents.executeJavaScript(code);
 for(let i=0;i<100 && !(await js('Boolean(window.fixtureReady)'));i++)await wait();
 if(!(await js('Boolean(window.fixtureReady)')))throw Error('fixture not ready');
 const rect=await js('(()=>{const r=document.querySelector("canvas.inpaint-mask-canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()');
 const x=Math.round(rect.x+rect.width/2),y=Math.round(rect.y+rect.height/2),outside=Math.round(rect.x+rect.width+30);
 const checks=[]; const snap=()=>js('window.pointerSnapshot()');
 function check(name,pass,data){checks.push({name,pass:!!pass,observed:data});}
 win.webContents.focus();
 win.webContents.debugger.attach('1.3');
 let pressed=null;
 async function input(type,xx=x,yy=y,button='left',extra={}){
  if(type==='mouseDown')pressed=button;if(type==='mouseUp')pressed=null;
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:{mouseMove:'mouseMoved',mouseDown:'mousePressed',mouseUp:'mouseReleased'}[type],x:xx,y:yy,button:type==='mouseMove'?(pressed||'none'):button,buttons:pressed==='left'?1:pressed==='middle'?4:0,clickCount:type==='mouseMove'?0:1});
  await wait();
 }
 await input('mouseMove');let s=await snap();check('hover inside shows brush',s.visible,s);
 await input('mouseDown'); await input('mouseMove',x+15,y+10);s=await snap();check('stroke captures pointer',s.captured,s);
 const beforeExit=s.exports;await input('mouseMove',outside,y);s=await snap();check('drag outside hides brush',!s.visible,s);check('drag outside releases paint capture',!s.captured,s);check('drag outside commits stroke once',s.exports===beforeExit+1,s);
 const exitPixels=s.pixels;await input('mouseMove',x+90,y+70);s=await snap();check('held reentry does not bridge stroke',s.pixels===exitPixels,s);
 await input('mouseUp');await input('mouseMove',outside,y);s=await snap();check('released outside brush stays hidden',!s.visible&&!s.captured,s);
 await input('mouseMove');await input('mouseDown');await input('mouseMove',x-35,y+30);s=await snap();const lostExports=s.exports;
 await js('(()=>{const c=document.querySelector("canvas.inpaint-mask-canvas");if(c.hasPointerCapture(window.lastPointerId))c.releasePointerCapture(window.lastPointerId);})()');await input('mouseMove',x-36,y+31);s=await snap();check('lost capture commits and ends stroke',s.exports===lostExports+1,s);const lostPixels=s.pixels;await input('mouseMove',x-80,y-50);s=await snap();check('lost capture does not keep painting',s.pixels===lostPixels,s);await input('mouseUp');
 await input('mouseDown');await input('mouseMove',x+35,y-60);s=await snap();const blurExports=s.exports;
 await js('window.dispatchEvent(new Event("blur"))');await wait();s=await snap();check('window blur releases and hides brush',!s.visible&&!s.captured,s);check('window blur commits once',s.exports===blurExports+1,s);await input('mouseUp');
 await input('mouseMove');await input('mouseDown',x,y,'middle');await input('mouseMove',outside,y,'middle');s=await snap();check('pan remains captured outside',s.captured&&!s.visible,s);await input('mouseUp',outside,y,'middle');s=await snap();check('pan release resets cursor state',!s.captured&&!s.panning,s);
 const result={checks,passed:checks.filter(c=>c.pass).length,total:checks.length,physicalPointerWarpTested:false,realPaidCalls:false};
 fs.writeFileSync(path.join(process.env.POINTER_OUTPUT,'RESULT.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,checks:result.checks.map(({name,pass,observed})=>({name,pass,observed:{visible:observed.visible,captured:observed.captured,exports:observed.exports,panning:observed.panning}}))}));win.destroy();app.exit(result.passed===result.total?0:1);
}).catch(e=>{console.error(e.stack);app.exit(2)});

