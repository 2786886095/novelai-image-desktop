export interface McpDiscoveredTool { name:string; description?:string; inputSchema:Record<string,unknown> }
export function configuredMcpTagTools(settings:{tagServerTool?:string;tagServerRelatedTool?:string;tagServerArtistTool?:string}) {
  return [...new Set([settings.tagServerTool?.trim()||'search_tags',settings.tagServerRelatedTool?.trim(),settings.tagServerArtistTool?.trim()].filter((v):v is string=>!!v))];
}
export function mcpToolsText(language:unknown) {
 const values:Record<string,string[]>={
  'zh-CN':['发现工具','发现工具中…','标签搜索工具','关联拓展工具（可选）','画师推荐工具（可选）','不使用','无法发现工具，请检查地址和协议；已保存的选择保留。','工具来自当前服务；发现只读取列表，不调用工具。','MCP 推荐','没有匹配结果'],
 };
 const [discover,busy,search,related,artist,none,error,hint,suggestions,empty]=values[String(language)]??values['zh-CN'];
 return {discover,busy,search,related,artist,none,error,hint,suggestions,empty};
}
