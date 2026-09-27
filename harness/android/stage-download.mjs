import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Only the small, hash-pinned descriptor belongs in the APK. The archive is a
// separate component release asset; staging must not copy user/runtime data.
export async function stageDownload(source, destination) {
  const meta = JSON.parse(await readFile(path.join(source, 'seed.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(meta.version) ||
      !/^[a-f0-9]{64}$/.test(meta.sha256) || meta.asset !== 'agent-rootfs.zip') throw Error('Invalid runtime descriptor');
  const file = path.join(source, meta.asset);
  if ((await stat(file)).size !== meta.bytes) throw Error('Runtime size mismatch');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== meta.sha256) throw Error('Runtime hash mismatch');
  meta.url = `https://github.com/2786886095/novelai-image-desktop/releases/download/agent-v${meta.version}/agent-rootfs.zip`;
  delete meta.asset;
  await mkdir(destination, {recursive:true});
  // Fail rather than accidentally ship an old embedded archive from a local build.
  try { await stat(path.join(destination,'agent-rootfs.zip')); throw Error('Remove embedded rootfs from APK assets before staging'); }
  catch (error) { if(error.code !== 'ENOENT') throw error; }
  await writeFile(path.join(destination,'seed.json'), JSON.stringify(meta,null,2)+'\n');
  await writeFile(path.join(source,'android-agent.json'), JSON.stringify(meta,null,2)+'\n');
  return meta;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await stageDownload(process.argv[2],process.argv[3]);
  console.log('ON-DEMAND DESCRIPTOR PASS: archive verified, metadata only staged');
}
