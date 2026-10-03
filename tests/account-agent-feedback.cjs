// Execute the literal source branches and render their JSX with React.
// This is controlled rendering, not a native-pointer or physical-device receipt.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function tree(root, file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function nodes(source, predicate) {
  const found = [];
  function visit(n) { if (predicate(n)) found.push(n); ts.forEachChild(n, visit); }
  visit(source); return found;
}
function unique(source, predicate) {
  const found = nodes(source, predicate);
  if (found.length !== 1) throw Error('Literal source site must be unique: ' + found.length);
  return found[0];
}
function variable(source, name) {
  return unique(source, n => ts.isVariableDeclaration(n) && n.name.getText(source) === name).getText(source);
}
function jsx(source, className) {
  return unique(source, n => ts.isJsxElement(n) && n.openingElement.attributes.properties.some(a => a.getText(source).includes('"' + className + '"'))).getText(source);
}
function evaluate(code, context) {
  return vm.runInContext(ts.transpileModule(code, {compilerOptions:{target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.React}}).outputText, context);
}
function plain(element) {
  if (element == null || typeof element === 'boolean') return '';
  if (Array.isArray(element)) return element.map(plain).join('');
  if (!React.isValidElement(element)) return String(element);
  if (typeof element.type === 'function') return plain(element.type(element.props));
  if (element.props.inert || element.props['aria-hidden'] === true) return '';
  return plain(element.props.children);
}
function elements(element) {
  if (Array.isArray(element)) return element.flatMap(elements);
  if (!React.isValidElement(element)) return [];
  if (typeof element.type === 'function') return elements(element.type(element.props));
  return [element, ...elements(element.props.children)];
}
async function checkFeedback(root) {
  const facts = [], check = (name, ok, actual) => facts.push({case:name, ok:!!ok, actual});
  const app = tree(root, 'src/App.tsx'), page = tree(root, 'src/PiAgentPage.tsx');
  const collapse = tree(root, 'src/components/CharacterEditing.tsx');
  const accountFunction = unique(app, n => ts.isFunctionDeclaration(n) && n.name?.text === 'AccountAndRunButton');
  const accountSource = ts.createSourceFile('account.tsx', accountFunction.getText(app), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const shell = jsx(accountSource, 'account-details-shell');
  const toggle = unique(accountSource, n => ts.isFunctionDeclaration(n) && n.name?.text === 'toggleAccountDetails').getText(accountSource);
  const accountHarness = (collapsed, account) => {
    const persisted = [], ctx = vm.createContext({React, accountDetailsCollapsed:collapsed, account, model:'nai-diffusion-5-full', refreshingAccount:false,
      clsx:(...x)=>x.filter(Boolean).join(' '), Icon:()=>null, isNAIV5Model:x=>x.includes('-5-'),
      useState:initial=>[typeof initial === 'function'?initial():initial,()=>{}], useEffect:()=>{},
      t:key=>key === 'common.unknown'?'未知':key,
      f:(key, values)=>key === 'account.anlas'?'Anlas: ' + values.balance:key + ':' + JSON.stringify(values),
      refreshBalance:()=>{}, setShowOpusUsage:()=>{},
      localStorage:{setItem:(key,value)=>persisted.push({key,value})},
    });
    ctx.setAccountDetailsCollapsed = updater => {ctx.accountDetailsCollapsed = updater(ctx.accountDetailsCollapsed);};
    evaluate(unique(collapse, n => ts.isFunctionDeclaration(n) && n.name?.text === 'AnimatedCollapse').getText(collapse).replace(/^export /,''), ctx);
    evaluate(toggle, ctx);
    const declarations = ['showV5Allowance','usagePercent','remainingImages','refillPercent','refillImages'].map(n=>'const ' + variable(accountSource,n) + ';').join('\n');
    const render = () => evaluate(`(function(){${declarations} return (${shell});})()`,ctx);
    return {ctx,render,persisted};
  };
  for (const hasToken of [false,true]) for (const balance of [null,7104]) for (const collapsed of [false,true]) {
    const h = accountHarness(collapsed,{hasToken,anlasBalance:balance,tierName:'Paper',tierLevel:1}), element = h.render();
    const text = plain(element), count = (text.match(/Anlas: /g)||[]).length;
    check(`balance-${hasToken?'configured':'unset'}-${balance??'unknown'}-${collapsed?'collapsed':'expanded'}`,count===1,{visibleCount:count,text,html:renderToStaticMarkup(element)});
  }
  const h = accountHarness(false,{hasToken:true,anlasBalance:7104,tierName:'Paper',tierLevel:3,expiresAt:'2030-01-01',opusUsage:{percent:25,timeUntilNextPercent:3600}});
  let e = h.render();
  check('refresh-expiry-v5-retained',elements(e).some(n=>n.type==='button'&&plain(n)==='account.refresh'&&!n.props.disabled)&&plain(e).includes('2030-01-01')&&plain(e).includes('V5'),plain(e));
  h.ctx.toggleAccountDetails(); e=h.render();
  check('collapse-once-persists-balance',h.ctx.accountDetailsCollapsed&&(plain(e).match(/Anlas: /g)||[]).length===1&&h.persisted[0]?.value==='1',h.persisted);
  h.ctx.toggleAccountDetails(); e=h.render();
  check('expand-once-persists-single-balance',!h.ctx.accountDetailsCollapsed&&(plain(e).match(/Anlas: /g)||[]).length===1&&h.persisted[1]?.value==='0',h.persisted);
  const working = unique(page,n=>ts.isJsxExpression(n)&&n.expression?.getText(page).includes('className="pi-working"')).getText(page);
  const status = unique(page,n=>ts.isJsxElement(n)&&n.openingElement.getText(page)==='<span role="status">').getText(page);
  const composer=jsx(page,'pi-composer');
  const switches=nodes(page,n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>a.getText(page)==='className="pi-option-toggle"')).map(n=>n.getText(page));
  const flagNames=['running',...(nodes(page,n=>ts.isVariableDeclaration(n)&&n.name.getText(page)==='controlsBusy').length?['controlsBusy']:[])];
  const declarations=flagNames.map(n=>'const '+variable(page,n)+';').join('\n');
  const save=variable(page,'saveOptions');
  const agentHarness = (flags={}) => {
    let complete, calls=0, sends=0;
    const reply = new Promise(resolve=>{complete=resolve;});
    const ctx=vm.createContext({React,busy:false,compacting:false,optionsBusy:false,pending:null,pendingQuestion:null,archived:false,configured:false,
      chat:{id:'owned',status:'idle',messages:[],draftAttachments:[]},selectedActions:[],text:'owned draft',inputRef:{current:null},
      sessionOptions:{webSearchEnabled:false,templateEnabled:true},t:x=>x,setError:x=>{ctx.error=x;},error:'',
      setOptionsBusy:x=>{ctx.optionsBusy=x;},updateWorkspace:w=>{ctx.updated=w;},setText:()=>{},run:()=>{sends++;},importAttachments:()=>{},
      window:{naiDesktop:{setStudioConversationOptions:(_id,patch)=>{calls++;ctx.patch=patch;return reply;},abortAgentMessage:()=>{ctx.abort=true;}}},
      ...flags,
    });
    for (const icon of ['LuPlus','LuSquare','LuArrowUp','LuSearch','LuFileText']) ctx[icon]=()=>null;
    const view=()=>evaluate(`(function(){${declarations}return <section>${working}${status}${composer}${switches.join('')}</section>})()`,ctx);
    // Bind the source's own save handler in the same initial-render closure.
    const handler=evaluate(`(function(){${declarations}const ${save};return saveOptions;})()`,ctx);
    return {ctx,view,handler,complete:result=>complete(result),calls:()=>calls,sends:()=>sends};
  };
  for (const key of ['studioWebSearchEnabled','studioTemplateEnabled']) {
    const g=agentHarness(), operation=g.handler({[key]:key==='studioWebSearchEnabled'});
    const html=renderToStaticMarkup(g.view());
    check(`${key}-saving-not-running`,g.ctx.optionsBusy&&!html.includes('pi-working')&&!html.includes('aria-label="stop"')&&!plain(g.view()).includes('statusRunning'),html);
    const buttons=elements(g.view()).filter(n=>n.type==='button');
    check(`${key}-saving-controls-disabled`,buttons.filter(n=>n.props.className==='pi-option-toggle').every(n=>n.props.disabled)&&buttons.find(n=>n.props['aria-label']==='send')?.props.disabled,html);
    g.complete({ok:true,workspace:{owned:key}});await operation;
    check(`${key}-saved-no-model-send`,!g.ctx.optionsBusy&&g.calls()===1&&g.sends()===0&&g.ctx.updated?.owned===key&&!renderToStaticMarkup(g.view()).includes('pi-working'),g.ctx.updated);
  }
  const failed=agentHarness(), request=failed.handler({studioWebSearchEnabled:true});failed.complete({ok:false,message:'owned disk failure'});await request;
  check('failed-save-releases-lock-keeps-error',!failed.ctx.optionsBusy&&failed.ctx.error==='owned disk failure'&&!renderToStaticMarkup(failed.view()).includes('pi-working'),{error:failed.ctx.error,optionsBusy:failed.ctx.optionsBusy});
  for (const flags of [{busy:true},{compacting:true},{chat:{id:'owned',status:'running',messages:[],draftAttachments:[]}},{chat:{id:'owned',status:'waiting-permission',messages:[],draftAttachments:[]}}]) {
    const g=agentHarness(flags),html=renderToStaticMarkup(g.view());
    check('real-activity-retains-stop-'+JSON.stringify(flags),html.includes('aria-label="stop"')&&html.includes('pi-working'),html);
    await g.handler({studioWebSearchEnabled:true});
    check('real-activity-blocks-option-write-'+JSON.stringify(flags),g.calls()===0,{calls:g.calls()});
  }
  return facts;
}
exports.checkFeedback=checkFeedback;
if (require.main === module) checkFeedback(path.resolve(process.argv[2]||path.join(__dirname,'..'))).then(facts=>{
  for (const f of facts) console.log(JSON.stringify(f));const passed=facts.filter(f=>f.ok).length;
  console.log(`RESULT=${passed}PASS/${facts.length-passed}FAIL`);process.exitCode=passed===facts.length?0:1;
}).catch(error=>{console.error(error.stack);process.exitCode=2;});
