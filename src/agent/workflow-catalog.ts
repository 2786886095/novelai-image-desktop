export const SOFTWARE_WORKFLOWS = [
 {id:'resources',title:'管理本地标签与相关标签数据库',examples:['查看资源数据库和下载大小','下载标签数据库','暂停资源下载','恢复上一版标签库'],tools:['langbai_software_capabilities','langbai_software_action'],steps:'resources.list 读取当前端操作、来源、体积与 revision；download/restore 在 Agent 内确认，started 只代表启动。再次 list 核对 jobs 和实际安装版本，pause 只请求暂停，看到 paused 才停止。clearCache 仅清内存；桌面 openDirectory 打开目录；Android delete 需确认且不删除图片。不要猜测未列出的操作。'},
 {id:'templates',title:'共用提示词模板',examples:['把模板切换为混合模式','导入这段转换模板','恢复内置模板'],tools:['langbai_templates'],steps:'read 读取对应用途/版本/模式→select 切换或 save 导入编辑→覆盖/restore 先在 Agent 确认并备份→回读。不生成。'},
 {id:'api',title:'配置 API 与私密凭据',examples:['更换提示词转换模型','设置酒馆 API','检查接口连接'],tools:['langbai_api'],steps:'read 查看用途和中文字段→configure 修改并在 Agent 内确认→credential 在私密输入框保存密钥→test 检查连接。不在聊天传密钥，不自动生成。'},
 {id:'parameters',title:'查看并调整工作台参数',examples:['把采样步数改为 28','查看当前生图参数'],tools:['langbai_read_studio_state','langbai_update_studio_config'],steps:'先读取实时参数与字段范围，只提交改动项，保存后回读；不触发生图。'},
 {id:'generation',title:'从描述到生成结果',examples:['按当前风格画一张雨夜街景'],tools:['langbai_get_generation_state','langbai_prepare_image_prompt','langbai_generate_image'],steps:'读取工作台→按当前软件模板一次完成提示词转换与生图；遵循会话策略：全自动不再确认，逐次确认模式仅对整条流程确认一次；失败停止，结果不明先查历史，不重复收费。'},
 {id:'library',title:'管理角色、世界书和预设',examples:['新建一个角色卡','修改这个风格的提示词','删除不用的预设'],tools:['langbai_library','langbai_import_studio_data'],steps:'read 查中文字段→create/update/delete→覆盖或删除时 Agent 确认→备份→保存回读。修改资料不等于绑定当前会话。'},
 {id:'queue',title:'查看、暂停和停止排队任务',examples:['还剩几张没生成','先暂停','停止生图'],tools:['langbai_tasks'],steps:'list 查任务→pause/resume/cancel/remove/clear；停止直接请求取消，继续收费任务在 Agent 内确认。只控制软件生成队列。'},
 {id:'backup',title:'备份并恢复本机资料',examples:['备份我的角色和预设','查看最近的备份','恢复昨天的备份'],tools:['langbai_backup'],steps:'create 保存本机备份；list→inspect 选分类→restore 在 Agent 内确认；恢复前先备份，返回路径与撤销说明。默认导出不含密钥。'},
 {id:'history',title:'整理历史图片和参考图',examples:['新建一个风景分组','把这张图片移到风景组','把这张图重命名为雨夜','导出风景分组并打开或分享 ZIP'],tools:['langbai_software_action'],steps:'从 actions 清单选择对应 list，获得 ID 与 revision 后修改；items.rename 重命名并回读实际文件名；groups.export 导出全部或指定分组（返回 ZIP ID、SHA256 与实际路径）；exports.list 读取导出列表后以 ID 调用 exports.open 打开或分享已校验 ZIP。普通整理和导出不反复确认，删除前 Agent 确认。'},
 {id:'text',title:'转换或反推提示词',examples:['把这段描述转成混合提示词','反推这张图'],tools:['langbai_convert_prompt','langbai_reverse_prompt'],steps:'读取软件配置与模板；调用付费模型前在 Agent 内确认；结果留在软件历史中。'}
] as const;
