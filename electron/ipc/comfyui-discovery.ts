import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ComfyInstallInspection } from '../../src/comfyui/contract';

export type ComfyDiscoveredLayout = 'aki' | 'portable' | 'venv' | 'source';
export interface ComfyEnvironmentCandidate {
  /** Opaque, stable identity for this canonical source directory; not an authorization token. */
  id: string;
  label: string;
  /** Directory containing main.py, not necessarily the bundle's outer directory. */
  root: string;
  python: string;
  layout: ComfyDiscoveredLayout;
  /** An observed, non-linked local models directory, or an empty string. */
  modelDirectory: string;
  reason: 'static-layout-detected' | 'python-not-found';
  warnings: string[];
  /** The explicit main-process scan boundary that contained this candidate. */
  sourceRoot: string;
  source?: 'configured' | 'discovered' | 'managed';
  isCurrent?: boolean;
  pythonArgs?: string[];
}
export type ComfyDiscoveryWarningCode = 'unsafe-root' | 'root-unavailable' | 'link-rejected' | 'directory-unavailable' | 'entry-limit-reached';
export interface ComfyDiscoveryWarning { sourceRoot: string; code: ComfyDiscoveryWarningCode }
export interface ComfyEnvironmentDiscoveryOptions { roots: string[]; maxDepth?: number; maxEntries?: number }
export interface ComfyEnvironmentDiscoveryResult {
  environments: ComfyEnvironmentCandidate[];
  warnings: ComfyDiscoveryWarning[];
  /** Number of directory entries enumerated across every explicit root. */
  examinedEntries: number;
  truncated: boolean;
}

type Lookup = { real: string; stat: fs.Stats; error?: never } | { error: 'missing' | 'link-rejected' | 'unavailable' | 'unsafe-path'; real?: never; stat?: never };
const ignoredDirectories = new Set([
  '.git', '.hg', '.svn', 'node_modules', '__pycache__', 'models', 'output', 'outputs', 'input',
  'custom_nodes', '.venv', 'venv', '.ext', 'python', 'python_embeded', 'python_embedded', 'windowsapps', 'logs',
]);
const normalizedKey = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
const forbiddenPath = (value: string) => /[\x00-\x1f]/.test(value)
  || /^(?:[\\/]{2}|\\\?\?\\)/.test(value)
  || /(?:^|[\\/])WindowsApps(?:[\\/]|$)/i.test(value);
function within(root: string, target: string): boolean {
  const relative = path.relative(normalizedKey(root), normalizedKey(target));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

/** Check every existing ancestor too: a harmless-looking leaf below a junction is still rejected. */
function inspectRoot(input: string): Lookup {
  if (typeof input !== 'string' || input.length > 4096 || !path.isAbsolute(input) || forbiddenPath(input)) return { error: 'unsafe-path' };
  let normalized = path.normalize(input);
  const parsed = path.parse(normalized);
  if (normalized.length > parsed.root.length) normalized = normalized.replace(/[\\/]+$/, '');
  if (normalizedKey(normalized) === normalizedKey(parsed.root)
    || normalized.slice(parsed.root.length).includes(':')
    || input.split(/[\\/]/).includes('..')) return { error: 'unsafe-path' };
  try {
    let current = parsed.root;
    let stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) return { error: 'link-rejected' };
    for (const component of normalized.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return { error: 'link-rejected' };
    }
    if (!stat.isDirectory()) return { error: 'unavailable' };
    const real = fs.realpathSync(normalized);
    // This also fails closed for unusual reparse points that lstat does not identify as a link.
    if (forbiddenPath(real) || normalizedKey(real) !== normalizedKey(normalized)) return { error: 'link-rejected' };
    return { real, stat };
  } catch { return { error: 'unavailable' }; }
}

/** Resolve a small fixed path or directory entry, without leaving or linking within its scan root. */
function inspectWithin(sourceRoot: string, target: string): Lookup {
  if (!within(sourceRoot, target) || forbiddenPath(target)) return { error: 'unsafe-path' };
  try {
    let current = sourceRoot;
    let stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) return { error: 'link-rejected' };
    const relative = path.relative(sourceRoot, target);
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return { error: 'link-rejected' };
    }
    const real = fs.realpathSync(target);
    if (forbiddenPath(real) || !within(sourceRoot, real) || normalizedKey(real) !== normalizedKey(path.normalize(target))) return { error: 'link-rejected' };
    return { real, stat };
  } catch (error) {
    return { error: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unavailable' };
  }
}

function candidateId(root: string, python: string): string {
  return `comfy-env-${createHash('sha256').update(normalizedKey(root) + '\0' + normalizedKey(python)).digest('hex').slice(0, 24)}`;
}
function candidatesAt(directory: string, sourceRoot: string): ComfyEnvironmentCandidate[] {
  const main = inspectWithin(sourceRoot, path.join(directory, 'main.py'));
  if (main.error || !main.stat.isFile()) return [];
  const root = path.dirname(main.real);
  const parent = path.dirname(root);
  const bundle = path.basename(root).toLowerCase() === 'comfyui' && within(sourceRoot, parent) ? parent : root;
  const executable = process.platform === 'win32' ? 'python.exe' : 'python';
  const venvDirectory = process.platform === 'win32' ? 'Scripts' : 'bin';
  const paths: Array<{ python: string; layout: ComfyDiscoveredLayout; pythonArgs?: string[] }> = [
    { python: path.join(bundle, 'python_embeded', executable), layout: 'portable', pythonArgs: ['-s'] },
    { python: path.join(bundle, 'python_embedded', executable), layout: 'portable', pythonArgs: ['-s'] },
    { python: path.join(bundle, 'python', executable), layout: 'aki' },
    { python: path.join(bundle, '.ext', executable), layout: 'aki' },
    ...[...new Set([root, bundle])].flatMap(location => ['.venv', 'venv'].map(name => ({
      python: path.join(location, name, venvDirectory, executable), layout: 'venv' as const,
    }))),
  ];
  const warnings = ['runtime-not-verified'];
  const interpreters: Array<{ python: string; layout: ComfyDiscoveredLayout; pythonArgs: string[] }> = [];
  for (const proposed of paths) {
    const found = inspectWithin(sourceRoot, proposed.python);
    if (!found.error && found.stat.isFile()) {
      if (!interpreters.some(item => normalizedKey(item.python) === normalizedKey(found.real))) {
        interpreters.push({ python: found.real, layout: proposed.layout, pythonArgs: proposed.pythonArgs || [] });
      }
    }
    if (found.error && found.error !== 'missing' && !warnings.includes('python-path-rejected')) warnings.push('python-path-rejected');
  }
  if (!interpreters.length) warnings.push('python-not-found');
  const models = inspectWithin(sourceRoot, path.join(root, 'models'));
  const modelDirectory = !models.error && models.stat.isDirectory() ? models.real : '';
  if (!modelDirectory) warnings.push(models.error && models.error !== 'missing' ? 'model-directory-path-rejected' : 'model-directory-not-found');
  return (interpreters.length ? interpreters : [{ python: '', layout: 'source' as const, pythonArgs: [] }]).map(({ python, layout, pythonArgs }) => ({
    id: candidateId(root, python),
    label: path.basename(layout === 'aki' || layout === 'portable' ? bundle : root),
    root, python, layout, modelDirectory, reason: python ? 'static-layout-detected' as const : 'python-not-found' as const,
    warnings: [...warnings], sourceRoot, source: 'discovered' as const, isCurrent: false, pythonArgs,
  }));
}

/** A native directory selection explicitly authorizes fixed layout siblings in
 * one immediate bundle only when the selected source directory is named ComfyUI.
 * Unlike passive discovery this never enumerates that parent or any other project. */
export function discoverSelectedComfyEnvironments(selected: string): ComfyEnvironmentCandidate[] {
  const checked = inspectRoot(selected);
  if (checked.error) throw new Error('COMFY_INSTALL_INVALID: COMFY_DISCOVERY_UNSAFE_SELECTION');
  const direct = inspectWithin(checked.real, path.join(checked.real, 'main.py'));
  if (!direct.error && direct.stat.isFile()) {
    let boundary = checked.real;
    if (path.basename(checked.real).toLowerCase() === 'comfyui') {
      const parent = inspectRoot(path.dirname(checked.real));
      if (!parent.error) boundary = parent.real;
    }
    return candidatesAt(checked.real, boundary);
  }
  const nested = inspectWithin(checked.real, path.join(checked.real, 'ComfyUI', 'main.py'));
  if (!nested.error && nested.stat.isFile()) return candidatesAt(path.dirname(nested.real), checked.real);
  throw new Error('COMFY_INSTALL_INVALID');
}

/** Saved main-process configuration is a separate explicit authority, not a request
 * to walk outside a renderer-selected root. Only its exact main/Python and a saved
 * immediate bundle cwd are inspected; no interpreter or launcher is executed. */
export function discoverConfiguredComfyEnvironments(install: ComfyInstallInspection | null | undefined): ComfyEnvironmentCandidate[] {
  if (!install || typeof install.root !== 'string' || typeof install.python !== 'string') return [];
  const checked = inspectRoot(install.root);
  if (checked.error) return [];
  const main = inspectWithin(checked.real, path.join(checked.real, 'main.py'));
  if (main.error || !main.stat.isFile()) return [];
  let boundary = checked.real;
  // A saved cwd is not a license to scan its whole subtree or a drive root.
  if (typeof install.cwd === 'string' && path.basename(checked.real).toLowerCase() === 'comfyui') {
    const cwd = inspectRoot(install.cwd);
    if (!cwd.error && normalizedKey(cwd.real) === normalizedKey(path.dirname(checked.real))) boundary = cwd.real;
  }
  const choices = candidatesAt(checked.real, boundary);
  let python = '';
  if (install.python && path.isAbsolute(install.python) && /^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i.test(path.basename(install.python))) {
    const parent = inspectRoot(path.dirname(install.python));
    if (!parent.error) {
      const interpreter = inspectWithin(parent.real, install.python);
      if (!interpreter.error && interpreter.stat.isFile()) python = interpreter.real;
    }
  }
  const matching = choices.find(item => normalizedKey(item.python) === normalizedKey(python));
  const base = matching || choices[0];
  if (!base) return [];
  const current: ComfyEnvironmentCandidate = { ...base, id: candidateId(checked.real, python), python,
    // An unmatched saved interpreter is shown exactly as saved, never replaced by
    // the first convenient interpreter from a different layout.
    layout: matching?.layout || 'source', pythonArgs: matching?.pythonArgs || [],
    reason: python ? 'static-layout-detected' : 'python-not-found', sourceRoot: boundary,
    source: 'configured', isCurrent: true,
    warnings: [...new Set([...base.warnings.filter(item => item !== 'python-not-found'), ...(python ? [] : ['python-not-found'])])],
  };
  return [current, ...choices.filter(item => item.python && item.id !== current.id)
    .map(item => ({ ...item, source: 'configured' as const }))];
}

/**
 * Main-process-only static discovery. Callers supply a few explicitly authorized local roots;
 * never wire renderer-provided paths straight through to this function. No program is run,
 * file content is read, PATH is searched, or network access is performed. A match is only a
 * filesystem-layout candidate; runtime help/probe validation is still required before use.
 */
export function discoverComfyEnvironments(options: ComfyEnvironmentDiscoveryOptions): ComfyEnvironmentDiscoveryResult {
  if (!options || !Array.isArray(options.roots) || options.roots.length > 32
    || (options.maxDepth !== undefined && (!Number.isInteger(options.maxDepth) || options.maxDepth < 0))
    || (options.maxEntries !== undefined && (!Number.isInteger(options.maxEntries) || options.maxEntries < 1))) {
    throw new Error('COMFY_DISCOVERY_OPTIONS');
  }
  const maxDepth = Math.min(options.maxDepth ?? 3, 3), maxEntries = Math.min(options.maxEntries ?? 512, 512);
  const result: ComfyEnvironmentDiscoveryResult = { environments: [], warnings: [], examinedEntries: 0, truncated: false };
  const warn = (sourceRoot: string, code: ComfyDiscoveryWarningCode) => {
    if (!result.warnings.some(warning => warning.sourceRoot === sourceRoot && warning.code === code)) result.warnings.push({ sourceRoot, code });
  };
  const available: string[] = [];
  for (const input of options.roots) {
    const checked = inspectRoot(input);
    if (checked.error) {
      // Deduplication is intentionally not applied to invalid roots: each input gets a result.
      result.warnings.push({ sourceRoot: typeof input === 'string' ? input : '', code: checked.error === 'unsafe-path' ? 'unsafe-root' : checked.error === 'link-rejected' ? 'link-rejected' : 'root-unavailable' });
    } else available.push(checked.real);
  }
  // Broader authorized roots take precedence; this makes provenance independent of input order.
  const boundaries: string[] = [];
  for (const root of available.sort((a, b) => a.length - b.length || normalizedKey(a).localeCompare(normalizedKey(b)))) {
    if (!boundaries.some(boundary => within(boundary, root))) boundaries.push(root);
  }
  const known = new Set<string>();
  for (const sourceRoot of boundaries) {
    const queue: Array<{ directory: string; depth: number }> = [{ directory: sourceRoot, depth: 0 }];
    while (queue.length) {
      if (result.examinedEntries >= maxEntries) { result.truncated = true; warn(sourceRoot, 'entry-limit-reached'); break; }
      const { directory, depth } = queue.shift()!;
      const checked = inspectWithin(sourceRoot, directory);
      if (checked.error || !checked.stat.isDirectory()) {
        warn(sourceRoot, checked.error === 'link-rejected' ? 'link-rejected' : 'directory-unavailable');
        continue;
      }
      for (const candidate of candidatesAt(checked.real, sourceRoot)) {
        if (!known.has(candidate.id)) { known.add(candidate.id); result.environments.push(candidate); }
      }
      if (depth >= maxDepth) continue;
      let handle: fs.Dir | undefined;
      const children: string[] = [];
      try {
        handle = fs.opendirSync(checked.real);
        while (result.examinedEntries < maxEntries) {
          const entry = handle.readSync();
          if (!entry) break;
          result.examinedEntries++;
          const child = path.join(checked.real, entry.name);
          if (entry.isSymbolicLink()) { warn(sourceRoot, 'link-rejected'); continue; }
          if (!entry.isDirectory() || ignoredDirectories.has(entry.name.toLowerCase())) continue;
          // Dirent alone is not a security boundary: recheck links and canonical containment.
          const inspected = inspectWithin(sourceRoot, child);
          if (!inspected.error && inspected.stat.isDirectory()) children.push(inspected.real);
          else if (inspected.error === 'link-rejected') warn(sourceRoot, 'link-rejected');
        }
        // Conservatively report truncation without reading a 513th entry just to peek.
        if (result.examinedEntries >= maxEntries) { result.truncated = true; warn(sourceRoot, 'entry-limit-reached'); }
      } catch { warn(sourceRoot, 'directory-unavailable'); }
      finally { try { handle?.closeSync(); } catch { /* A removed directory must not abort the remaining roots. */ } }
      children.sort((a, b) => normalizedKey(a).localeCompare(normalizedKey(b)));
      for (const child of children) queue.push({ directory: child, depth: depth + 1 });
    }
  }
  result.environments.sort((a, b) => normalizedKey(a.root).localeCompare(normalizedKey(b.root)));
  return result;
}
