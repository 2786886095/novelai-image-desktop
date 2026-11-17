import {normalizeAppLanguage} from "./i18n";
const tokens:Record<string,string>={
 api:"账号 帐号 帳號 帳戶 账户 代理 中转 中轉 token 连接 網路 网络 proxy relay account network 접속 프록시 계정 アカウント プロキシ SOCKS HTTP",
 storage:"目录 路径 儲存 儲存位置 输出 輸出 本地 下载 下載 資料 作品 download output directory storage local folder フォルダ 保存先 다운로드 저장소 출력",
 backup:"备份 備份 恢复 還原 还原 导入 匯入 导出 匯出 backup restore export import バックアップ 復元 백업 복원",
 "ai-reverse":"反推 图片识别 圖片辨識 視覺 视觉 vision reverse image inference 画像認識 이미지 분석",
 "convert-api":"转换 轉換 翻译 翻譯 模型 服务 服務 convert translation model API 모델 번역 翻訳 モデル",
 templates:"模版 模板 範本 template presets 提示词 提示詞 テンプレート 템플릿",
 prompt:"标签 標籤 词库 詞庫 字典 补全 補全 提词 提詞 权重 權重 tag dictionary autocomplete prompt タグ 辞書 補完 태그 사전",
 language:"语言 語言 中文 英语 日语 韩语 language English locale 言語 언어",
 sound:"声音 聲音 音量 提示音 静音 靜音 sound volume audio mute 効果音 音量 소리 음량",
 appearance:"托盘 托盤 系統匣 退出 关闭 關閉 布局 佈局 经典 經典 新版 主题 主題 深色 缩放 縮放 文字 字体 字體 皮肤 tray close exit theme dark layout zoom font system-tray トレイ レイアウト ズーム 트레이 레이아웃 확대",
 performance:"缓存 快取 并发 並行 性能 限制 cache concurrent performance GPU キャッシュ 성능 캐시",
 mcp:"智能体 智能體 连接 連線 工具 协议 協議 mcp agent tools protocol エージェント 도구 에이전트",
 about:"版本 更新 下载 下載 日志 記錄 许可证 授權 version update license logs バージョン 업데이트 버전",
};
const labels={
 "zh-CN":["查找设置","个匹配分类","没有匹配的分类。可试试「托盘」「代理」或「备份」。","清除搜索"],
 "zh-TW":["查找設定","個符合的分類","沒有符合分類。可試試「系統匣」「代理」或「備份」。","清除搜尋"],
 "en-US":["Find a setting","matching categories","No matching category. Try “tray”, “proxy”, or “backup”.","Clear search"],
 "ja-JP":["設定を検索","件のカテゴリ","一致しません。「トレイ」や「バックアップ」をお試しください。","検索を消去"],
 "ko-KR":["설정 찾기","개 분류","일치하는 분류가 없습니다. 트레이, 프록시 또는 백업을 검색해 보세요.","검색 지우기"],
} as const;
export function settingsSearchText(language:unknown){
 const [label,groups,empty,reset]=labels[normalizeAppLanguage(language)];
 return {label,groups,empty,reset};
}
export function matchSettingsSection(id:string,label:string,query:string){
 const normalize=(value:string)=>value.normalize("NFKC").toLocaleLowerCase().trim();
 const haystack=normalize(label+" "+id+" "+(tokens[id]??""));
 return normalize(query).split(/\s+/).every(term=>haystack.includes(term));
}
