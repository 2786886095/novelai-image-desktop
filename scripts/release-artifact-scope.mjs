// Current release-only artifact policy. Pure checks; never invokes GitHub or publishes.
import assert from 'node:assert/strict';
export function releaseArtifactNames(version,{withVerification=false}={}) {
  assert.ok(/^\d+\.\d+\.\d+$/.test(version),'Invalid release asset version');
  const names=[`Langbai-NovelAI-Studio-Setup-${version}.exe`,`Langbai-NovelAI-Studio-${version}.exe`,`Langbai-NovelAI-Studio-${version}-universal.dmg`,`Langbai-NovelAI-Studio-${version}.zip`];
  return withVerification?[...names,'verification.json']:names;
}
export function assertReleaseArtifactScope(names,{version,withVerification=false}={}) {
  assert.ok(Array.isArray(names)&&names.every(name=>typeof name==='string'),'Release asset names are required');
  assert.deepEqual([...names].sort(),releaseArtifactNames(version,{withVerification}).sort(),
    'Current Windows/macOS release assets differ; extra/missing/duplicate assets are not allowed');
}
