import {expect,it} from 'vitest';
import fs from 'node:fs';
import {DATA_BACKUP_CATEGORIES} from './data-backup-contract';
it('desktop and mobile expose the same independent archive categories',()=>{
 const mobile=fs.readFileSync('mobile/lib/services/data_backup_service.dart','utf8');
 const enumBlock=mobile.split('enum DataBackupCategory {')[1].split('final String id')[0];
 for(const id of DATA_BACKUP_CATEGORIES)expect(enumBlock).toContain("'"+id+"'");
 expect(new Set(DATA_BACKUP_CATEGORIES).size).toBe(11);
});
it('backup renderer and sanitizer share the category contract instead of drifting lists',()=>{
 for(const file of ['src/features/settings/DataBackupSettings.tsx','electron/ipc/data-backup.ts'])
 expect(fs.readFileSync(file,'utf8')).toContain('data-backup-contract');
});
