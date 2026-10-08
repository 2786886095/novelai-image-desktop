// Run the actual stage function/handlers without loading unrelated App panels.
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
global.getComputedStyle = () => ({objectFit: 'contain'});
function load(file) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  new Function('exports', 'require', output)(exports, name => name==='react'?{useState:initial=>env.useNamedState('compareEnabled',initial),useRef:initial=>({current:initial}),useEffect:env.useEffect}:name==='./store'?{useAppStore}:load(path.resolve(path.dirname(file), name + '.ts')));
  return exports;
}
const source = fs.readFileSync(process.argv[2] || path.join(root, 'src/App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const named = name => ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast);
let output = ts.transpileModule(named('clampNumber') + '\n' + named('ZoomableImageStage'), {compilerOptions: {jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022}}).outputText;
output = output.replace(/const (\w+) = useRef\(/g, "const $1 = useNamedRef('$1', ").replace(/const \[(\w+), (\w+)\] = useState\(/g, "const [$1, $2] = useNamedState('$1', ");
const history = [0, 1, 2].map(i => ({id: 'material-' + i, filePath: 'F:/materials/' + i + '.png', fileUrl: 'image-' + i, width: 100, height: 400}));
const image = {filePath: 'f:\\materials\\1.png', fileUrl: 'loaded-workbench', width: 100, height: 400};
const bounds = {left: 220, top: 30, width: 200, height: 400};
const picture = {getBoundingClientRect: () => bounds, naturalWidth: 100, naturalHeight: 400};
const current = history[1];
const state = {history, currentImage: current, workbenchImage: image, inputPreviewAnchor: {result: current}, activeTab: 'generate', settings: {language: 'en-US'}, selectImage: item => {state.currentImage = item; state.inputPreviewAnchor = null; selected.push(item.id);}};
let selected = [], prevented = 0;
const values = {zoom: 1, fullscreen: true, pan: {x: 0, y: 0}, shellSize: {width: 600, height: 400}, intrinsicSize: {width: 100, height: 400}};
const effects = [];
const refs = {};
const useAppStore = selector => selector(state); useAppStore.getState = () => state;
const env = {
  React: {createElement: (type, props, ...children) => ({type, props: {...props, children}})},
  useMemo: fn => fn(), useCallback: fn => fn,
  useEffect: (fn, deps) => effects.push({fn, deps}),
  useNamedState: (name, initial) => [values[name] ?? initial, value => {values[name] = typeof value === 'function' ? value(values[name]) : value;}],
  useNamedRef: (name, initial) => refs[name] = {current: name === 'shellRef' ? {getBoundingClientRect: () => ({left: 20, top: 30, width: 600, height: 400}), focus() {}} : name === 'frameRef' ? {getBoundingClientRect: () => bounds} : /^(imageRef|beforeImageRef)$/.test(name) ? picture : initial},
  useAppStore, clsx: (...args) => args.filter(Boolean).join(' '), desktopUiText: (_language, key) => key,
  historyPickerText: () => ['History', 'Previous', 'Next'], workflowText: () => ({preview: 'Preview'}),
  ImageFavoriteButton: 'ImageFavoriteButton', AppPortal: 'AppPortal', PreviewImageViewer: 'PreviewImageViewer', Icon: 'Icon',
  ResizeObserver: class {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  resolveCanvasImage: load(path.join(root, 'src/canvas-preview.ts')).resolveCanvasImage,
  ...(fs.existsSync(path.join(root, 'src/image-stage-navigation.ts')) ? load(path.join(root, 'src/image-stage-navigation.ts')) : {}),
  getComputedStyle: () => ({objectFit: 'contain'}),
};
env.useResultComparison=load(path.join(root,'src/use-result-comparison.ts')).useResultComparison;
const stage = new Function('env', `const {${Object.keys(env).join(',')}}=env;${output};return ZoomableImageStage;`)(env)({image, alt: 'Probe'});
function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of (node.props?.children || []).flat(Infinity)) {const result = find(child, predicate); if (result) return result;}
}
const shell = find(stage, n => n.props?.className?.includes('zoom-frame-shell'));
const viewer = find(stage, n => n.type === 'PreviewImageViewer');
const event = (x, y) => ({target: {closest: () => null}, currentTarget: {focus() {}, setPointerCapture() {}}, clientX: x, clientY: y, button: 0, pointerId: 1, key: 'ArrowRight', preventDefault() {prevented++;}, stopPropagation() {}});
shell.props.onKeyDown(event(320, 230));
const keySelection = selected.slice();
values.fullscreen = false; shell.props.onClick(event(240, 230)); const blankClickOpened = values.fullscreen;
values.fullscreen = false; shell.props.onClick(event(320, 230)); const imageClickOpened = values.fullscreen;
values.fullscreen = true; effects.find(e => e.deps?.[0] === image.fileUrl).fn();
console.log(JSON.stringify({keySelection, blankClickOpened, imageClickOpened, viewerImages: viewer.props.images.length, viewerIndex: viewer.props.index, staysOpenOnImageChange: values.fullscreen, prevented}));
