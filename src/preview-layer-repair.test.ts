import {it,expect} from 'vitest';import fs from 'node:fs';
import ts from 'typescript';
const read=(p:string)=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
it('all image previews sit above the application highest modal token',()=>{const s=read('src/preview-unified.css');expect(s).toContain('calc(var(--z-overlay-top, 20000) + 100)');expect(s).not.toContain('z-index:1800');});
it('nested viewer traps Tab and restores the triggering control',()=>{const s=read('src/components/PreviewImageViewer.tsx');expect(s).toContain("e.key==='Tab'");expect(s).toContain('previous.focus({preventScroll:true})');});
it('requested character explanation is no longer rendered',()=>expect(read('src/App.tsx')).not.toContain('{t("convert.knownCharacterHint")}'));
it('installed state can be read before any update network request',()=>expect(read('electron/ipc/harness-engine.ts')).toContain('async refreshInstalledState()'));
it('download planning refreshes disk state and does not offer an older installed bundle',()=>{const s=read('electron/ipc/harness-launcher.ts');expect(s).toContain('await engine!.refreshInstalledState()');expect(s).toContain('planHarnessDownload(');expect(read('electron/ipc/harness-download-plan.ts')).toContain('!isNewerBundle(asset.version,installed.version)');});

it('removes only the viewport-sized preview focus ring, retaining keyboard focus and controls',()=>{
 const styles=fs.readFileSync('src/styles.css','utf8');
 const viewer=fs.readFileSync('src/components/PreviewImageViewer.tsx','utf8');
 expect(styles).toContain('.image-preview-viewer:focus-visible { outline: none; }');
 expect(styles).not.toContain('.image-preview-viewer:focus-visible { outline: 2px');
 expect(viewer).toContain('tabIndex={0}');expect(viewer).toContain("e.key==='Tab'");
 expect(viewer).toContain('root.current?.focus({preventScroll:true})');
 expect(viewer).toContain("e.key==='Escape'");
 expect(styles).toContain('.char-row-toggle:focus-visible { outline: 2px solid var(--accent)');
});

it('the final startup stylesheet excludes canvas and viewport wrappers without removing control rings',()=>{
 const motion=read('src/layout-motion.css');
 expect(motion).toContain('[tabindex]:not(.image-preview-viewer):not(.zoom-frame-shell)');
 expect(motion).toContain('html :is(.image-preview-viewer,.zoom-frame-shell,.canvas-area):focus-visible {outline:none;box-shadow:none;}');
 expect(motion).toContain('button,input,select,textarea');
 const startup=read('src/main.tsx');
 expect(startup.indexOf('"./layout-motion.css"')).toBeGreaterThan(startup.indexOf('"./styles.css"'));
});

// Execute the main-stage's actual wheel callback with deterministic geometry.
// The separate Chromium receipt also covers trusted wheel/pointer/click events.
function mainStageWheel(initialZoom=1, frame={width:600,height:400}) {
 const source=read('src/App.tsx'),ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const stage=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ZoomableImageStage') as ts.FunctionDeclaration;
 const clamp=stage.body!.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='clampPanForZoom')!;
 const numberClamp=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='clampNumber')!;
 const assignment=stage.body!.statements.find(n=>ts.isExpressionStatement(n)&&ts.isBinaryExpression(n.expression)&&n.expression.left.getText(ast)==='wheelHandlerRef.current') as ts.ExpressionStatement;
 expect(assignment,'main-stage wheel handler must exist').toBeDefined();
 const refs={current:{zoom:initialZoom,pan:{x:0,y:0}}};let prevented=0;
 const env={frameSize:frame,shellSize:{width:600,height:400},wheelTransformRef:refs,wheelHandlerRef:{current:null as null|((event:Record<string,unknown>)=>void)},panStartRef:{current:null as unknown},compareDragRef:{current:false},shellRef:{current:{getBoundingClientRect:()=>({left:20,top:30})}},setZoom:()=>{},setPan:()=>{}};
 const body=`const {frameSize,shellSize,wheelTransformRef,wheelHandlerRef,panStartRef,compareDragRef,shellRef,setZoom,setPan}=env;${numberClamp.getText(ast)};${clamp.getText(ast)};${assignment.getText(ast)};return wheelHandlerRef.current;`;
 const callback=new Function('env',ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(env) as (event:Record<string,unknown>)=>void;
 return {refs,env,get prevented(){return prevented;},wheel:(deltaY:number,deltaMode=0,clientX=320,clientY=230)=>callback({deltaY,deltaMode,clientX,clientY,preventDefault:()=>{prevented++;}})};
}
it('main image has a nonpassive wheel listener with matching unmount cleanup',()=>{
 const s=read('src/App.tsx');expect(s).toContain("element.addEventListener('wheel', wheel, { passive: false })");expect(s).toContain("element.removeEventListener('wheel', wheel)");
});
it('main-stage wheel zooms in and out around the pointer, returning exactly to fit',()=>{
 const p=mainStageWheel();p.wheel(-100,0,170,130);
 const z=p.refs.current.zoom;expect(z).toBeGreaterThan(1);expect(p.refs.current.pan.x).toBeCloseTo(150*(1-z));expect(p.refs.current.pan.y).toBeCloseTo(100*(1-z));
 p.wheel(100,0,170,130);expect(p.refs.current).toEqual({zoom:1,pan:{x:0,y:0}});expect(p.prevented).toBe(2);
});
it('consecutive wheel events before a React commit accumulate and stay within fit and eightfold zoom',()=>{
 const p=mainStageWheel();for(let i=0;i<100;i++)p.wheel(-1e6);expect(p.refs.current.zoom).toBe(8);for(let i=0;i<100;i++)p.wheel(1e6);expect(p.refs.current).toEqual({zoom:1,pan:{x:0,y:0}});
});
it('main-stage normalizes line/page delta modes and ignores horizontal-only or invalid deltas',()=>{
 for(const mode of [0,1,2]){const p=mainStageWheel();p.wheel(-100,mode);expect(p.refs.current.zoom).toBeCloseTo(Math.exp(.2));}
 for(const delta of [0,NaN,Infinity,-Infinity]){const p=mainStageWheel();p.wheel(delta);expect(p.refs.current.zoom).toBe(1);expect(p.prevented).toBe(0);}
});
it('active image panning or comparison divider gestures do not change scale',()=>{
 const p=mainStageWheel(2);p.env.panStartRef.current={};p.wheel(-100);expect(p.refs.current.zoom).toBe(2);p.env.panStartRef.current=null;p.env.compareDragRef.current=true;p.wheel(-100);expect(p.refs.current.zoom).toBe(2);expect(p.prevented).toBe(2);
});
it('main-stage keeps letterboxed images centered on the short axis',()=>{
 const p=mainStageWheel(1,{width:200,height:400});p.wheel(-100,0,100,230);const {zoom,pan}=p.refs.current;expect(pan.x).toBeCloseTo(100*(1-zoom));expect(pan.y).toBeLessThanOrEqual(0);
});
it('main-stage preserves click preview while suppressing a moved pan gesture',()=>{
 const s=read('src/App.tsx');expect(s).toContain('if(panMovedRef.current){panMovedRef.current=false;event.preventDefault();return;}');expect(s).toContain('if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) panMovedRef.current = true;');expect(s).toContain('onClick={()=>setFullscreen(true)}');
});
