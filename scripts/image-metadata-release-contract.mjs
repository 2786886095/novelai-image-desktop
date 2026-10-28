// Pure fail-closed CI checks. A green build job alone is not metadata evidence.
export const metadataGateName = 'Verify official image metadata';
function requireGate(job) {
  if (job?.conclusion !== 'success' || !job.steps?.some(step =>
    step.name === metadataGateName && step.conclusion === 'success')) {
    throw new Error('Required image metadata gate did not pass: ' + (job?.name ?? 'missing job'));
  }
}
export function assertDesktopMetadataGates(run) {
  const jobs = run?.jobs?.filter(job => job.name?.startsWith('build (')) ?? [];
  if (jobs.length !== 2) throw new Error('Metadata evidence requires two desktop builds');
  for (const platform of ['windows', 'macos']) {
    const matches = jobs.filter(job => job.name.includes(platform));
    if (matches.length !== 1) throw new Error('Missing or duplicate metadata platform: ' + platform);
    requireGate(matches[0]);
  }
}
