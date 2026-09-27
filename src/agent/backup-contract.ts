export const BACKUP_CATEGORIES=['tavernAgent','styleLab','configuration','apiCredentials','artistLibrary','textHistory','referencePresets','imageHistory','promptPresets','agentWorkspace','workspaceData'] as const;
export function validateBackupRequest(args:Record<string,unknown>) {
 const action=args.action;if(!['list','create','inspect','restore'].includes(String(action)))throw Error('备份操作应为 list/create/inspect/restore');
 const allowed=action==='list'?['action','offset','limit']:action==='create'?['action','categories']:action==='inspect'?['action','backupId','categories']:['action','inspectionId'];
 for(const key of Object.keys(args))if(!allowed.includes(key))throw Error('未知备份参数：'+key);
 for(const key of action==='inspect'?['backupId']:action==='restore'?['inspectionId']:[])if(typeof args[key]!=='string'||!(args[key] as string)||String(args[key]).length>100)throw Error('请先读取有效的备份编号');
 if(args.categories!==undefined&&(!Array.isArray(args.categories)||!args.categories.length||args.categories.length>BACKUP_CATEGORIES.length||args.categories.some(x=>!BACKUP_CATEGORIES.includes(x))||new Set(args.categories).size!==args.categories.length))throw Error('备份分类无效，请按功能清单选择');
 for(const [key,min,max] of [['offset',0,1000000],['limit',1,50]] as const)if(args[key]!==undefined&&(!Number.isSafeInteger(args[key])||Number(args[key])<min||Number(args[key])>max))throw Error('备份分页参数无效');
 return args as {action:'list'|'create'|'inspect'|'restore';categories?:Array<typeof BACKUP_CATEGORIES[number]>;backupId?:string;inspectionId?:string;offset?:number;limit?:number};
}
