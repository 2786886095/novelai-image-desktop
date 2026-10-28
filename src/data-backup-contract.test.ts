import {expect,it} from 'vitest';
import fs from 'node:fs';
import {DATA_BACKUP_CATEGORIES} from './data-backup-contract';
it('desktop exposes nine distinct independent archive categories',()=>{
 expect(new Set(DATA_BACKUP_CATEGORIES).size).toBe(9);
});
it('backup renderer and sanitizer share the category contract instead of drifting lists',()=>{
 for(const file of ['src/features/settings/DataBackupSettings.tsx','electron/ipc/data-backup.ts'])
 expect(fs.readFileSync(file,'utf8')).toContain('data-backup-contract');
});
