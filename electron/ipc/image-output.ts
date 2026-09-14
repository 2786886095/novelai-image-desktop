import fs from 'node:fs/promises';
import path from 'node:path';

/** Reserve the name at the write boundary, not with a racy access() probe. */
export async function writeUniqueImageFile(dir: string, base: string, extension: string, bytes: Buffer): Promise<string> {
  if (!base || base !== path.basename(base) || base === '.' || base === '..' || !/^[a-z0-9]+$/i.test(extension)) {
    throw new Error('Invalid image filename');
  }
  for (let index = 0; ; index++) {
    const file = path.join(dir, `${base}${index ? `-${index}` : ''}.${extension}`);
    let handle;
    try {
      handle = await fs.open(file, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      // This invocation owns the newly-created path; no existing image was opened.
      await fs.unlink(file).catch(() => undefined);
      throw error;
    }
    await handle.close();
    return file;
  }
}
