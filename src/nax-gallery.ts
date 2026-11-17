export const NAX_ATTRIBUTION = {
  author: "u/Carlyone",
  name: "NovelAI Tag Experiments",
  url: "https://nax.moe/",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
} as const;
export const NAX_COLLECTIONS = [
  ["V5", "Artist Tags · Constrained", "danbooru-artist-tags-v5"],
  ["V5", "Artist Tags · Loose", "danbooru-artist-tags-2-v5"],
  ["V5", "Artist Tags · Loose (Male)", "danbooru-artist-tags-male-2-v5"],
  ["V5", "Character Tags", "danbooru-character-tags-v5"],
  ["V5", "Hair Tags", "danbooru-hair-tags-v5"],
  ["V4.5", "Artist Tags · Constrained", "danbooru-artist-tags-v4.5"],
  ["V4.5", "Artist Tags · Loose", "danbooru-artist-tags-2-v4.5"],
  ["V4.5", "Character Tags", "danbooru-character-tags-v4.5"],
  ["V4.5", "Copyright Tags", "danbooru-copyright-tags-v4.5"],
  ["V4.5", "Curated Artists", "artists-v4.5"],
  ["V4.5", "Face Tags", "danbooru-face-tags-v4.5"],
  ["V4.5", "Hair Tags", "danbooru-hair-tags-v4.5"],
  ["V4", "Artist Tags", "danbooru-artist-tags-v4"],
  ["V4", "Character Tags", "danbooru-character-tags-v4"],
  ["V4", "Face Tags", "danbooru-face-tags-v4"],
].map(([model,title,id])=>({model,title,id,url:new URL("?gallery="+id,NAX_ATTRIBUTION.url).href}));

export function searchNaxCollections(query:string){
 const q=query.trim().toLowerCase().slice(0,200);
 return NAX_COLLECTIONS.filter(row=>!q || [row.model,row.title,row.id].some(value=>value.toLowerCase().includes(q)));
}

export const NAX_MODELS = ["V5", "V4.5", "V4"] as const;
type NaxLocale = import("./types").AppLanguage;
type ExperimentKind = "constrained"|"loose"|"male"|"artist"|"curated"|"character"|"copyright"|"hair"|"face";
const descriptions: Record<NaxLocale, Record<ExperimentKind, [string, string]>> = {
 "zh-CN": {constrained:["画师标签 · 固定条件","用细致提示词锁定主体与构图，比较画师标签的影响。"],loose:["画师标签 · 简短提示词","减少提示词约束，观察画师标签本身如何改变画面。"],male:["画师标签 · 男性主体","以男性主体和简短提示词比较不同画师标签。"],artist:["画师标签","比较不同 Danbooru 画师标签对画风的影响。"],curated:["精选画师","浏览原站整理的画师对照实验。"],character:["角色标签","比较不同角色标签在相同生成条件下的表现。"],copyright:["作品 / IP 标签","观察作品与系列标签带来的风格变化。"],hair:["发型与发色","比较发型、发色等头发相关标签。"],face:["面部标签","比较五官、表情等面部相关标签。"]},
 "zh-TW": {constrained:["畫師標籤 · 固定條件","以細緻提示詞固定主體與構圖，比較畫師標籤的影響。"],loose:["畫師標籤 · 簡短提示詞","減少提示詞約束，觀察畫師標籤如何改變畫面。"],male:["畫師標籤 · 男性主體","以男性主體和簡短提示詞比較畫師標籤。"],artist:["畫師標籤","比較 Danbooru 畫師標籤對畫風的影響。"],curated:["精選畫師","瀏覽來源網站整理的畫師對照實驗。"],character:["角色標籤","比較角色標籤在相同生成條件下的表現。"],copyright:["作品 / IP 標籤","觀察作品與系列標籤帶來的風格變化。"],hair:["髮型與髮色","比較頭髮相關標籤。"],face:["臉部標籤","比較五官與表情相關標籤。"]},
 "en-US": {constrained:["Artist tags · Constrained","Compare artist tags with the subject and composition tightly specified."],loose:["Artist tags · Loose prompt","Compare artists using a shorter, less restrictive prompt."],male:["Artist tags · Male subject","Compare artist tags using a short prompt with a male subject."],artist:["Artist tags","Compare Danbooru artist tags and their influence on style."],curated:["Curated artists","Browse artist comparisons selected by the source."],character:["Character tags","Compare character tags under the same generation settings."],copyright:["Series / IP tags","Explore how work and franchise tags change the result."],hair:["Hair tags","Compare tags for hairstyles and hair colors."],face:["Face tags","Compare facial features and expressions."]},
 "ja-JP": {constrained:["作家タグ · 条件固定","被写体と構図を細かく指定し、作家タグの効果を比較。"],loose:["作家タグ · 短いプロンプト","短いプロンプトで作家タグの効果を比較。"],male:["作家タグ · 男性キャラクター","男性キャラクターを使って作家タグを比較。"],artist:["作家タグ","Danbooru の作家タグによる画風の違いを比較。"],curated:["厳選作家","提供元が選んだ作家の比較実験。"],character:["キャラクタータグ","同じ生成条件でキャラクタータグを比較。"],copyright:["作品・IP タグ","作品やシリーズのタグによる変化を比較。"],hair:["髪型・髪色","髪型や髪色に関するタグを比較。"],face:["顔のタグ","顔の特徴や表情に関するタグを比較。"]},
 "ko-KR": {constrained:["작가 태그 · 조건 고정","피사체와 구도를 고정해 작가 태그의 효과를 비교합니다."],loose:["작가 태그 · 짧은 프롬프트","짧은 프롬프트에서 작가 태그의 차이를 비교합니다."],male:["작가 태그 · 남성 피사체","남성 피사체와 짧은 프롬프트로 작가 태그를 비교합니다."],artist:["작가 태그","Danbooru 작가 태그에 따른 화풍을 비교합니다."],curated:["엄선한 작가","원본 사이트에서 고른 작가 비교 실험을 봅니다."],character:["캐릭터 태그","같은 생성 조건에서 캐릭터 태그를 비교합니다."],copyright:["작품 / IP 태그","작품 및 시리즈 태그가 만드는 변화를 비교합니다."],hair:["머리 모양과 색","머리 모양과 색에 관한 태그를 비교합니다."],face:["얼굴 태그","얼굴 특징과 표정 태그를 비교합니다."]},
};
export const NAX_PAGE_COPY: Record<NaxLocale, [string,string,string,string,string,string]> = {
 "zh-CN":["标签实验目录","在同一组实验中逐个替换标签，比较画风、角色或细节如何变化。","模型版本","实验合集","在浏览器查看对照图","由 {author} 整理"],
 "zh-TW":["標籤實驗目錄","以相同條件逐一替換標籤，比較畫風、角色或細節的變化。","模型版本","實驗合集","在瀏覽器查看對照圖","由 {author} 整理"],
 "en-US":["Tag experiments","Change one tag at a time in a set to compare styles, characters, and details.","Model version","Experiment collections","View comparisons in browser","Curated by {author}"],
 "ja-JP":["タグ実験カタログ","同じ条件でタグを一つずつ変え、画風・キャラクター・細部を比較します。","モデルのバージョン","実験コレクション","ブラウザーで比較画像を見る","編集：{author}"],
 "ko-KR":["태그 실험 목록","같은 조건에서 태그를 하나씩 바꿔 화풍, 캐릭터, 세부 표현을 비교합니다.","모델 버전","실험 모음","브라우저에서 비교 이미지 보기","편집: {author}"],
};
export function naxExperimentCopy(id: string, language: NaxLocale): [string,string] {
 const kind = id.startsWith("artists-") ? "curated"
  : id.includes("-male-") ? "male" : id.includes("-tags-2-") ? "loose"
  : id.includes("-artist-") ? id.endsWith("-v4") ? "artist" : "constrained"
  : id.includes("-character-") ? "character" : id.includes("-copyright-") ? "copyright"
  : id.includes("-hair-") ? "hair" : "face";
 return descriptions[language][kind];
}

export type NaxImage = {url:string; tag:string};
export type NaxChapter = {page:number; label:string};
export type NaxAlbumPage = {collection:string; page:number; images:NaxImage[]; chapters:NaxChapter[]};
const collectionIds=new Set(NAX_COLLECTIONS.map(row=>row.id));
const MAX_NAX_PAGE=500;

export function naxCollectionUrl(raw:unknown,page:unknown=1):URL {
 if(typeof raw!=="string"||!collectionIds.has(raw))throw Error("Unknown NAX collection");
 if(typeof page!=="number"||!Number.isInteger(page)||page<1||page>MAX_NAX_PAGE)throw Error("Invalid NAX page");
 const url=new URL(NAX_ATTRIBUTION.url);
 url.searchParams.set("gallery",raw);
 if(page>1){url.searchParams.set("sort","date");url.searchParams.set("page",String(page));}
 return url;
}

export function naxMediaUrl(raw:unknown,collection?:string):string|null {
 if(typeof raw!=="string"||raw.length>1024)return null;
 try{
  const url=new URL(raw);
  if(url.origin!=="https://cdn.zele.st"||url.username||url.password||url.search||url.hash)return null;
  const p=url.pathname.match(/^\/data\/NAX\/Images\/([^/]+)\/([^/]+\.(?:webp|png|jpe?g|avif))$/i);
  if(!p||!collectionIds.has(p[1])||(collection&&collection!==p[1]))return null;
  let file=p[2];
  for(let i=0;i<2;i++){
   file=decodeURIComponent(file);
   if(/[\/\\\x00-\x1f]/.test(file)||file==="."||file==="..")return null;
   if(!/%[a-f\d]{2}/i.test(file))break;
  }
  return url.href;
 }catch{return null;}
}

function naxText(value:string):string {
 const entities:Record<string,string>={amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" "};
 return value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|quot|apos|lt|gt|nbsp);/ig,(all,entity:string)=>{
   const e=entity.toLowerCase();
   if(e[0]!=="#")return entities[e]??all;
   const code=e[1]==="x"?Number.parseInt(e.slice(2),16):Number(e.slice(1));
   return code>31&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):" ";
 }).replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,256);
}

function naxAttr(tag:string,key:string):string {
 const m=new RegExp("(?:^|\\s)"+key+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')","i").exec(tag);
 return m?.[1]??m?.[2]??"";
}

/** Read data from the source's public server-rendered index. Never mount remote markup. */
export function parseNaxAlbumPage(html:string,collection:string,page:number):NaxAlbumPage {
 if(html.length>8*1024*1024)throw Error("NAX collection response too large");
 const images:NaxImage[]=[],seen=new Set<string>(),chapters=new Map<number,string>();
 for(const tag of html.matchAll(/<img\b[^>]{0,3072}>/gi)){
  const url=naxMediaUrl(naxText(naxAttr(tag[0],"src")),collection);
  const label=naxText(naxAttr(tag[0],"alt")).replace(/^An image depicting\s+/i,"");
  if(!url||!label||seen.has(url))continue;
  seen.add(url);images.push({url,tag:label});
 }
 for(const node of html.matchAll(/(<a\b[^>]{0,1000}>)\s*([^<>]{1,128})\s*<\/a>/gi)){
  if(!naxAttr(node[1],"class").split(/\s+/).includes("page-link"))continue;
  let href:URL;
  try{href=new URL(naxText(naxAttr(node[1],"href")),NAX_ATTRIBUTION.url);}catch{continue;}
  const n=Number(href.searchParams.get("page"));
  if(href.origin===NAX_ATTRIBUTION.url.replace(/\/$/,"")&&href.pathname==="/"&&href.searchParams.get("gallery")===collection&&Number.isInteger(n)&&n>=1&&n<=MAX_NAX_PAGE)
    chapters.set(n,naxText(node[2]));
 }
 if(!images.length)throw Error("No supported images in the NAX response");
 return {collection,page,images,chapters:[...chapters].map(([page,label])=>({page,label})).sort((a,b)=>a.page-b.page)};
}

export const NAX_NATIVE_COPY:Record<NaxLocale,[string,string,string,string,string]> = {
 "zh-CN":["对照图","返回实验合集","原站分册","对照图由 NAX 提供，需联网加载。","无法读取 NAX 合集，请检查网络后重试。"],
 "zh-TW":["對照圖","返回實驗合集","來源分冊","對照圖由 NAX 提供，需連線載入。","無法讀取 NAX 合集，請檢查網路後再試。"],
 "en-US":["Comparison images","Back to experiment collections","Source section","Comparison images are loaded from NAX over the internet.","Could not load this NAX collection. Check your connection and retry."],
 "ja-JP":["比較画像","実験一覧へ戻る","配布元の区分","比較画像はオンラインで NAX から読み込みます。","NAX の読み込みに失敗しました。接続を確認して再試行してください。"],
 "ko-KR":["비교 이미지","실험 목록으로 돌아가기","원본 분류","비교 이미지는 NAX에서 온라인으로 불러옵니다.","NAX 모음을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요."],
};

export const NAX_TAG_COPY:Record<NaxLocale,[string,string,string]> = {
 "zh-CN":["复制 Tag","已复制 Tag","复制 Tag 失败"],
 "zh-TW":["複製 Tag","已複製 Tag","複製 Tag 失敗"],
 "en-US":["Copy tag","Tag copied","Could not copy tag"],
 "ja-JP":["タグをコピー","タグをコピーしました","タグをコピーできませんでした"],
 "ko-KR":["태그 복사","태그를 복사했습니다","태그를 복사하지 못했습니다"],
};
