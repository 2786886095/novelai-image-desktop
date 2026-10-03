export interface McpDiscoveredTool { name:string; description?:string; inputSchema:Record<string,unknown> }
export function configuredMcpTagTools(settings:{tagServerTool?:string;tagServerRelatedTool?:string;tagServerArtistTool?:string}) {
  return [...new Set([settings.tagServerTool?.trim()||'search_tags',settings.tagServerRelatedTool?.trim(),settings.tagServerArtistTool?.trim()].filter((v):v is string=>!!v))];
}
export function mcpToolsText(language:unknown) {
 const values:Record<string,string[]>={
  'zh-CN':['发现工具','发现工具中…','标签搜索工具','关联拓展工具（可选）','画师推荐工具（可选）','不使用','无法发现工具，请检查地址和协议；已保存的选择保留。','工具来自当前服务；发现只读取列表，不调用工具。','MCP 推荐','没有匹配结果'],
  'zh-TW':['探索工具','探索工具中…','標籤搜尋工具','關聯拓展工具（可選）','畫師推薦工具（可選）','不使用','無法探索工具，請檢查位址和協議；已儲存的選擇保留。','工具來自目前服務；探索僅讀取清單，不呼叫工具。','MCP 推薦','沒有符合的結果'],
  'en-US':['Discover tools','Discovering…','Tag search tool','Related tags tool (optional)','Artist tool (optional)','Disabled','Tool discovery failed. Check the endpoint/transport; saved choices are retained.','Tools belong to this server. Discovery lists tools without calling them.','MCP suggestions','No matches'],
  'ja-JP':['ツールを検出','検出中…','タグ検索ツール','関連タグ（任意）','アーティスト推奨（任意）','使用しない','検出できません。接続先を確認してください。保存済みの選択は保持されます。','検出はツール一覧の読み取りのみです。','MCP 推奨','結果なし'],
  'ko-KR':['도구 검색','검색 중…','태그 검색 도구','관련 태그 도구 (선택)','아티스트 도구 (선택)','사용 안 함','도구 검색 실패. 주소/프로토콜을 확인하세요. 저장된 선택은 유지됩니다.','도구 검색은 목록만 읽으며 도구를 실행하지 않습니다.','MCP 추천','결과 없음'],
 };
 const [discover,busy,search,related,artist,none,error,hint,suggestions,empty]=values[String(language)]??values['en-US'];
 return {discover,busy,search,related,artist,none,error,hint,suggestions,empty};
}
