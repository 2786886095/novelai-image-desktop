import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { ComfyDependencyCheck, ComfyInstallInspection, ComfyLaunchDiagnosis } from '../../src/comfyui/contract';
import { sanitizedChildEnv, validatePythonPath } from './comfyui-install';
import { redactComfyLog } from './comfyui-process';

type Requirement = { name: string; required: string; supported: boolean; exact: string | null };
type Metadata = { pythonVersion: string | null; packages: Record<string, { status: 'found' | 'missing' | 'unknown'; version: string | null }> };
const nameKey = (value: string) => value.toLowerCase().replace(/[-_.]+/g, '-');

/** Deliberately small, non-executing subset: bare names and numeric exact pins.
 * Markers, ranges, extras, URLs, includes and editable installs stay unknown. */
export function parseComfyRequirements(text: string): Requirement[] {
  const result: Requirement[] = [];
  for (const raw of text.split(/\r?\n/).slice(0, 1024)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]{0,199})(.*)$/.exec(line);
    const name = match?.[1] || line.slice(0, 200), required = match?.[2].trim() || '';
    const pin = /^==\s*(\d+(?:\.\d+)*)$/.exec(required);
    result.push({ name, required: match ? required : line.slice(0, 1000), supported: !!match && (!required || !!pin), exact: pin?.[1] || null });
  }
  return result;
}
function release(value: string): string | null {
  if (!/^\d+(?:\.\d+)*(?:\+[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*)?$/.test(value)) return null;
  const parts = value.split('+')[0].split('.').map(part => part.replace(/^0+(?=\d)/, ''));
  while (parts.length > 1 && parts.at(-1) === '0') parts.pop();
  return parts.join('.');
}
export function compareComfyMetadata(requirements: Requirement[], metadata: Metadata | null): ComfyDependencyCheck[] {
  return requirements.map(item => {
    const observed = metadata?.packages[nameKey(item.name)];
    let status: ComfyDependencyCheck['status'] = 'unknown';
    // Missing distribution metadata is not proof that an importable/vendored
    // package is absent. Do not block a valid environment on that observation.
    if (item.supported && observed?.status === 'found' && observed.version) {
      if (!item.exact) status = 'satisfied';
      else {
        const actual = release(observed.version), wanted = release(item.exact);
        if (actual && wanted) status = actual === wanted ? 'satisfied' : 'mismatch';
      }
    }
    return { name: item.name, required: item.required, installed: observed?.version || null, status };
  });
}
const SCRIPT = [
  'import sys,json',
  'from importlib import metadata',
  'result={"pythonVersion":sys.version.split()[0],"packages":{}}',
  'for name in json.loads(sys.argv[1]):',
  ' try: result["packages"][name]={"status":"found","version":metadata.version(name)}',
  ' except metadata.PackageNotFoundError: result["packages"][name]={"status":"missing","version":None}',
  ' except Exception: result["packages"][name]={"status":"unknown","version":None}',
  'print(json.dumps(result))',
].join('\n');
export interface ComfyDependencyProbeOptions { signal?: AbortSignal; execFile?: typeof execFile; timeoutMs?: number }
export async function probeComfyDependencies(inspection: ComfyInstallInspection, options: ComfyDependencyProbeOptions = {}): Promise<Pick<ComfyInstallInspection, 'pythonVersion' | 'dependencyChecks' | 'dependencyProbeMessage'>> {
  options.signal?.throwIfAborted();
  let requirements: Requirement[];
  try {
    const file = path.join(inspection.root, 'requirements.txt'), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error('requirements unavailable');
    requirements = parseComfyRequirements(fs.readFileSync(file, 'utf8'));
  } catch {
    return { pythonVersion: inspection.pythonVersion, dependencyChecks: [], dependencyProbeMessage: 'COMFY_DEPENDENCY_REQUIREMENTS_UNAVAILABLE' };
  }
  const names = [...new Set(requirements.filter(item => /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(item.name)).map(item => nameKey(item.name)))];
  if (!names.length) return { pythonVersion: inspection.pythonVersion, dependencyChecks: compareComfyMetadata(requirements, null), dependencyProbeMessage: null };
  try {
    const python = validatePythonPath(inspection.python);
    const output = await new Promise<string>((resolve, reject) => (options.execFile || execFile)(python,
      ['-I', '-B', '-c', SCRIPT, JSON.stringify(names)],
      { windowsHide: true, shell: false, cwd: path.dirname(python), env: sanitizedChildEnv(), encoding: 'utf8',
        timeout: Math.min(options.timeoutMs || 5000, 10_000), maxBuffer: 1024 * 1024, signal: options.signal },
      (error, stdout, stderr) => error ? reject(new Error(`COMFY_DEPENDENCY_METADATA_UNAVAILABLE: ${redactComfyLog(String(stderr || error.message)).slice(-2000)}`)) : resolve(String(stdout))));
    const raw = JSON.parse(output) as Metadata;
    if (!raw || !raw.packages || typeof raw.packages !== 'object' || Array.isArray(raw.packages)) throw new Error('COMFY_DEPENDENCY_METADATA_INVALID');
    const packages: Metadata['packages'] = Object.create(null);
    for (const name of names) {
      const item = raw.packages[name];
      if (item && ['found', 'missing', 'unknown'].includes(item.status)
        && (item.version === null || (typeof item.version === 'string' && item.version.length <= 200))) packages[name] = item;
    }
    return { pythonVersion: typeof raw.pythonVersion === 'string' && /^\d+\.\d+(?:\.\d+)?$/.test(raw.pythonVersion) ? raw.pythonVersion : inspection.pythonVersion,
      dependencyChecks: compareComfyMetadata(requirements, { pythonVersion: null, packages }), dependencyProbeMessage: null };
  } catch (error) {
    options.signal?.throwIfAborted();
    return { pythonVersion: inspection.pythonVersion, dependencyChecks: compareComfyMetadata(requirements, null),
      dependencyProbeMessage: redactComfyLog(String(error)).slice(-2000) };
  }
}
export function comfyDependencyDiagnosis(inspection: ComfyInstallInspection): ComfyLaunchDiagnosis | undefined {
  const packages = inspection.dependencyChecks || [];
  return packages.some(item => item.status === 'mismatch' || item.status === 'missing')
    ? { kind: 'dependency-mismatch', python: inspection.python, packages } : undefined;
}
