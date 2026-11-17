import {useEffect,useId,useMemo,useRef,useState} from "react";
import browse from "../../shared/tag-pack-browse.json";
import {TAG_PACK_LANGUAGES,TAG_PACK_MANIFEST,TAG_PACK_NAMES,TAG_BROWSE_PAGE_SIZE,TAG_PACK_SORTS,tagPackLanguage,tagPackSort,type TagPackSort,type TagPackLanguage,type TagPackStatus,type TagPackPage} from "../../shared/multilingual-tag-pack-contract";
import {tagPackKey,useTagPackRevision} from "../tag-pack-lookup";
import {capsuleTagUnits} from "../compact-prompt";
import {fmtCount} from "../text-utils";
import type {TagSuggestion} from "../types";
import {Icon} from "./icons";
import {SelectMenu} from "./ui";
import "../capsule-browser.css";

const categories = {
  "zh-CN":["热门标签","发型与发色","五官与面部","人数与体态","奇幻特征","套装与制服","日常穿搭","鞋袜与配饰","表情与视线","动作与姿态","物品与道具","场景与环境","画风与构图","其他标签","作品与 IP","热门角色","长尾角色"],
  "zh-TW":["熱門標籤","髮型與髮色","五官與臉部","人數與體態","奇幻特徵","套裝與制服","日常穿搭","鞋襪與配飾","表情與視線","動作與姿態","物品與道具","場景與環境","畫風與構圖","其他標籤","作品與 IP","熱門角色","長尾角色"],
  "en-US":["Popular tags","Hair and color","Facial features","People and body","Fantasy traits","Outfits and uniforms","Everyday clothes","Footwear and accessories","Expressions and gaze","Actions and poses","Items and props","Scenes and settings","Style and composition","Other tags","Titles and franchises","Popular characters","Long-tail characters"],
  "ja-JP":["人気タグ","髪型・髪色","顔・目鼻立ち","人数・体型","幻想的な特徴","衣装・制服","普段着","靴・小物","表情・視線","動き・ポーズ","小道具","場面・環境","画風・構図","その他","作品・シリーズ","人気キャラクター","ロングテールのキャラクター"],
  "ko-KR":["인기 태그","헤어·색상","얼굴 특징","인원·체형","판타지 특징","의상·제복","일상복","신발·액세서리","표정·시선","동작·자세","사물·소품","장면·배경","화풍·구도","기타 태그","작품·시리즈","인기 캐릭터","롱테일 캐릭터"],
} as const;
const ui = {
  "zh-CN":["词库语言","选择语言","已启用","切换","下载","正在应用…","数据更新","未能启用词库，请重试。","先选择一种词库语言，即可浏览和搜索。","没有匹配的标签","搜索结果","显示更多","可搜索完整词库","按用途浏览","加载中…"],
  "zh-TW":["詞庫語言","選擇語言","已啟用","切換","下載","正在套用…","資料更新","無法啟用詞庫，請重試。","先選擇一種詞庫語言，即可瀏覽和搜尋。","沒有符合的標籤","搜尋結果","顯示更多","可搜尋完整詞庫","依用途瀏覽","載入中…"],
  "en-US":["Dictionary language","Choose language","Active","Switch","Download","Applying…","Updated","Could not activate the dictionary. Try again.","Choose a dictionary language to browse and search.","No matching tags","Search results","Show more","Search covers the whole dictionary","Browse by purpose","Loading…"],
  "ja-JP":["辞書の言語","言語を選ぶ","使用中","切り替え","ダウンロード","適用中…","更新","辞書を有効にできませんでした。再試行してください。","辞書の言語を選ぶと閲覧と検索ができます。","一致するタグがありません","検索結果","さらに表示","辞書全体を検索できます","用途から探す","読み込み中…"],
  "ko-KR":["사전 언어","언어 선택","사용 중","전환","다운로드","적용 중…","업데이트","사전을 활성화하지 못했습니다. 다시 시도하세요.","사전 언어를 선택하면 둘러보기와 검색을 할 수 있습니다.","일치하는 태그가 없습니다","검색 결과","더 보기","전체 사전을 검색할 수 있습니다","용도별 보기","불러오는 중…"],
} as const;
type Locale = keyof typeof ui;
const WINDOW_SIZE = TAG_BROWSE_PAGE_SIZE;
export const capsuleBrowseGroups = browse.updatedAt === TAG_PACK_MANIFEST.updatedAt ? browse.groups : [];

export function browseTags(group: (typeof capsuleBrowseGroups)[number], results: ReadonlyMap<string,TagSuggestion>) {
  return group.tags.flatMap(tag => {
    const row=results.get(tagPackKey(tag));
    return row && row.tag===tag ? [row] : [];
  });
}

const feedback={
  "zh-CN":["已选","站务","上一页","下一页","按 Esc 或清空搜索返回浏览","直接添加为自定义标签","浏览隐藏评级和站务；可搜索"],
  "zh-TW":["已選","站務","上一頁","下一頁","按 Esc 或清除搜尋以返回瀏覽","直接新增為自訂標籤","瀏覽隱藏分級和站務；可搜尋"],
  "en-US":["Selected","Site metadata","Previous","Next","Clear search or press Esc to browse","Add as a custom tag","Ratings and site metadata are searchable only"],
  "ja-JP":["選択済み","サイト情報","前へ","次へ","検索を消去するか Esc で閲覧に戻る","カスタムタグとして追加","評価とサイト情報は検索でのみ表示"],
  "ko-KR":["선택됨","사이트 정보","이전","다음","검색을 지우거나 Esc로 둘러보기","사용자 태그로 추가","등급과 사이트 정보는 검색에서만 표시"],
} as const;
const pagingCopy={
  "zh-CN":["全库标签","搜索范围","全库","当前分类","页码","跳转","匹配标签","浏览标签","标签未能载入，请重试。","重试"],
  "zh-TW":["全庫標籤","搜尋範圍","全庫","目前分類","頁碼","跳轉","符合的標籤","可瀏覽標籤","無法載入標籤，請重試。","重試"],
  "en-US":["All tags","Search scope","Entire dictionary","Current category","Page number","Go","matches","browsable tags","Could not load tags. Try again.","Retry"],
  "ja-JP":["全タグ","検索範囲","辞書全体","現在のカテゴリ","ページ番号","移動","一致タグ","閲覧タグ","タグを読み込めません。再試行してください。","再試行"],
  "ko-KR":["전체 태그","검색 범위","전체 사전","현재 분류","페이지 번호","이동","일치 태그","탐색 태그","태그를 불러오지 못했습니다. 다시 시도하세요.","재시도"],
} as const;

const SORT_KEY="langbai.capsule-tag-sort.v1";
const browseCopy = {
 "zh-CN":["排序","默认排序","使用量从高到低","Tag 名 A–Z","相关推荐","添加或搜索一个标签，查看常搭配的词。","当前没有可推荐的相关标签。"],
 "zh-TW":["排序","預設排序","使用量由高至低","Tag 名稱 A–Z","相關推薦","新增或搜尋標籤，查看常搭配的詞。","目前沒有可推薦的相關標籤。"],
 "en-US":["Sort","Default order","Most used","Tag name A–Z","Related tags","Add or search for a tag to see common pairings.","No related tags found."],
 "ja-JP":["並べ替え","既定の順序","使用数の多い順","タグ名 A–Z","関連タグ","タグを追加または検索して、組み合わせを確認できます。","関連タグは見つかりませんでした。"],
 "ko-KR":["정렬","기본 순서","사용량 높은 순","태그 이름 A–Z","관련 태그","태그를 추가하거나 검색하면 자주 쓰는 조합을 볼 수 있어요.","관련 태그가 없습니다."],
} as const;

function PageNumber({page,total,label,go,onChange}:{page:number;total:number;label:string;go:string;onChange:(value:number)=>void}){
  const [draft,setDraft]=useState(String(page+1));
  useEffect(()=>setDraft(String(page+1)),[page,total]);
  const submit=()=>{
    const normalized=draft.normalize("NFKC").trim();
    if(!/^-?\d+$/.test(normalized)){setDraft(String(page+1));return;}
    const next=Math.trunc(Math.max(1,Math.min(total,Number(normalized))));
    setDraft(String(next));if(next!==page+1)onChange(next-1);
  };
  return <div className="capsule-page-field">
    <input aria-label={label} type="text" inputMode="numeric" value={draft} size={String(total).length}
      onChange={event=>setDraft(event.target.value)} onBlur={submit} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();submit();}}}/>
    <button type="button" className="capsule-library-more" onClick={submit}>{go}</button>
  </div>;
}

export function isCapsuleManagementTag(tag:string) {
  const key=tagPackKey(tag);
  return /^rating\s*:/.test(key) || /^(?:commentary(?: request)?|translated|partially translated|translation request|check translation|copyright name|tagme)$/.test(key);
}
export function capsulePage<T>(items:readonly T[],page:number) {
  const total=Math.max(1,Math.ceil(items.length/WINDOW_SIZE));
  const safe=Math.min(Math.max(0,page),total-1);
  return {rows:items.slice(safe*WINDOW_SIZE,(safe+1)*WINDOW_SIZE),index:safe,total};
}
function TagCards({rows,onPick,selected,badges}:{rows:TagSuggestion[];onPick:(tag:string)=>void;selected:ReadonlyMap<string,number>;badges:readonly string[]}) {
  return <div className="capsule-library-grid">
    {rows.map(row => {
      const num=selected.get(tagPackKey(row.tag))??0;
      return <button key={row.tag} type="button" className="capsule-library-tag"
        data-capsule-library-tag={row.tag} data-capsule-picked={num>0||undefined}
        onClick={()=>onPick(row.tag)} title={[row.description,row.tag,fmtCount(row.count),num?badges[0]+" ×"+num:""].filter(Boolean).join(" · ")}>
        <span className="capsule-card-names"><strong>{row.description || row.tag}</strong><small>{row.tag}</small></span>
        <span className="capsule-card-action">
          {num>0?<strong aria-label={badges[0]+" "+num}>{num}</strong>:isCapsuleManagementTag(row.tag)?<small>{badges[1]}</small>:<Icon name="plus"/>}
        </span>
      </button>;
    })}
  </div>;
}

export function CapsuleTagBrowser({query,onQueryChange,searchPlaceholder,onPick,language,selectedPrompt}:{
  query:string;onQueryChange:(text:string)=>void;searchPlaceholder:string;onPick:(tag:string)=>void;language?:unknown;selectedPrompt:string;
}) {
  const locale=Object.hasOwn(ui,String(language)) ? language as Locale : "zh-CN";
  const l=ui[locale], names=categories[locale], badges=feedback[locale], paging=pagingCopy[locale], ordering=browseCopy[locale];
  const [status,setStatus]=useState<TagPackStatus|null>(null);
  const [groupIndex,setGroupIndex]=useState(0),[groupPages,setGroupPages]=useState<Record<number,number>>({});
  const [searchScope,setSearchScope]=useState<"all"|"group">("all");
  const [retry,setRetry]=useState(0);
  const [order,setOrder]=useState<TagPackSort>(()=>tagPackSort(localStorage.getItem(SORT_KEY)));
  const [related,setRelated]=useState<{key:string; rows:TagSuggestion[]}>({key:"",rows:[]});
  function changeOrder(value:string) {
    const next=tagPackSort(value);
    setGroupPages({});setSearchPage(null);setOrder(next);
    localStorage.setItem(SORT_KEY,next);
    results.current?.scrollTo({top:0,behavior:"instant"});
  }
  const [searchPage,setSearchPage]=useState<{key:string;index:number}|null>(null);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState<TagPackLanguage|null>(null),[error,setError]=useState(false);
  const [result,setResult]=useState<{key:string;data?:TagPackPage}|null>(null);
  const autoSelected=useRef(false);
  const search=useRef<HTMLInputElement>(null),switcher=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null),results=useRef<HTMLDivElement>(null),menuId=useId();
  const revision=useTagPackRevision();
  const q=query.trim(), active=status?.active;
  const group=capsuleBrowseGroups[groupIndex];
  const browseGroup=group?.id??"all";
  const groupId=q&&searchScope==="all"?"all":browseGroup;
  const searchKey=active ? [active,revision,groupId,q,order].join("\0") : "";
  const page=q?(searchPage?.key===searchKey?searchPage.index:0):(groupPages[groupIndex]??0);
  const requestKey=[searchKey,page,retry].join("\0");
  const data=result?.key===requestKey?result.data:undefined;
  const pending=!!active&&result?.key!==requestKey;
  const lastForScope=result?.key.startsWith(searchKey+"\0")?result.data:undefined;
  const numPages=Math.max(1,Math.ceil((data?.total??lastForScope?.total??0)/WINDOW_SIZE));
  const selected=useMemo(()=>{
    const mapped=new Map<string,number>();
    for(const unit of capsuleTagUnits(selectedPrompt)){
      const tag=tagPackKey(unit.core);
      mapped.set(tag,(mapped.get(tag)??0)+1);
    }
    return mapped;
  },[selectedPrompt]);
  const seedKey=JSON.stringify([...new Set([...(q?[q]:[]),...Array.from(selected.keys()).filter(tag=>!isCapsuleManagementTag(tag)).slice(-11)])]);
  const relatedKey=[active,revision,seedKey].join("\0");
  useEffect(()=>{
    if(!active||seedKey==="[]")return;
    let live=true;
    const timer=window.setTimeout(()=>{
      void window.naiDesktop.relatedMultilingualTags(JSON.parse(seedKey),8).then(rows=>{
        if(live)setRelated({key:relatedKey,rows});
      }).catch(()=>{if(live)setRelated({key:relatedKey,rows:[]});});
    },150);
    return ()=>{live=false;window.clearTimeout(timer);};
  },[active,seedKey,relatedKey]);
  const suggestions=related.key===relatedKey?related.rows.filter(row=>!selected.has(tagPackKey(row.tag))):[];
  useEffect(()=>{
    let live=true;
    void window.naiDesktop.multilingualTagStatus().then(async next=>{
      if(!live)return;
      setStatus(next);
      const preferred=tagPackLanguage(locale);
      if(!next.active&&!next.preferred&&preferred&&next.installed.includes(preferred)&&!autoSelected.current){
        autoSelected.current=true;
        const activated=await window.naiDesktop.installMultilingualTagPack(preferred,"use").catch(()=>null);
        if(live&&activated?.active===preferred){
          setStatus(activated);
          window.dispatchEvent(new Event("langbai:multilingual-tags-changed"));
        }
      }
    }).catch(()=>{if(live)setStatus({active:null,installed:[],updatedAt:TAG_PACK_MANIFEST.updatedAt});});
    return ()=>{live=false;};
  },[revision,locale]);

  useEffect(()=>{
    if(!active)return;
    let live=true;
    const timer=window.setTimeout(()=>{
      void window.naiDesktop.browseMultilingualTags(groupId,q,page,order)
        .then(data=>{if(live)setResult({key:requestKey,data});})
        .catch(()=>{if(live)setResult({key:requestKey});});
    },q?150:0);
    return ()=>{live=false;window.clearTimeout(timer);};
  },[active,groupId,q,page,order,requestKey]);

  useEffect(()=>{
    if(!open)return;
    const outside=(e:PointerEvent)=>{
      if(e.target instanceof Node && !switcher.current?.contains(e.target))setOpen(false);
    };
    document.addEventListener("pointerdown",outside,true);
    return ()=>document.removeEventListener("pointerdown",outside,true);
  },[open]);

  async function chooseLanguage(pack:TagPackLanguage) {
    if(!status || busy)return;
    if(pack===status.active){setOpen(false);search.current?.focus();return;}
    setError(false); setBusy(pack);
    try{
      const next=await window.naiDesktop.installMultilingualTagPack(pack,status.installed.includes(pack)?"use":"download");
      if(next.active!==pack)throw Error("Tag dictionary was not changed");
      setStatus(next);
      window.dispatchEvent(new Event("langbai:multilingual-tags-changed"));
      setOpen(false);
      search.current?.focus({preventScroll:true});
    }catch{setError(true);}
    finally{setBusy(null);}
  }

  function changePage(next:number) {
    if(q)setSearchPage({key:searchKey,index:next});
    else setGroupPages(pages=>({...pages,[groupIndex]:next}));
    results.current?.scrollTo({top:0,behavior:"instant"});
  }
  return <section className="capsule-library">
    <div className="capsule-library-toolbar">
      <label className="capsule-library-search"><Icon name="search"/>
        <input ref={search} type="search" data-capsule-query="" className="prompt-chip-search" value={query} onChange={e=>onQueryChange(e.target.value)}
          aria-label={searchPlaceholder} placeholder={searchPlaceholder}
          onKeyDown={event=>{if(event.key==="Escape"&&query){event.preventDefault();event.stopPropagation();onQueryChange("");}}}/>
      </label>
      <div className="capsule-pack-control" ref={switcher}>
        <button ref={trigger} type="button" className="capsule-pack-trigger" data-capsule-pack-trigger=""
          aria-label={[l[0],active?TAG_PACK_NAMES[active]:l[1]].join(" · ")} aria-controls={menuId} aria-expanded={open}
          onClick={()=>setOpen(value=>!value)}>
          <Icon name="globe"/><span>{busy?l[5]:active?TAG_PACK_NAMES[active]:l[1]}</span><Icon name="chevronDown"/>
        </button>
        {open&&<div id={menuId} role="group" aria-label={l[0]} className="capsule-pack-popover">
          <strong>{l[0]}</strong>
          <div className="capsule-pack-options">
            {TAG_PACK_LANGUAGES.map(pack=>{
              const current=active===pack;
              return <button type="button" key={pack} data-capsule-pack-language={pack} aria-pressed={current}
                disabled={!status||!!busy} onClick={()=>void chooseLanguage(pack)}>
                <span>{TAG_PACK_NAMES[pack]}</span>
                <small>{busy===pack?l[5]:current?l[2]:status?.installed.includes(pack)?l[3]:
                  [l[4],Math.round(TAG_PACK_MANIFEST.packs[pack].size/1024**2)+" MiB"].join(" · ")}</small>
              </button>;
            })}
          </div>
          <small className="capsule-pack-updated">{l[6]} · {status?.updatedAt??browse.updatedAt}</small>
          {error&&<p role="alert">{l[7]}</p>}
        </div>}
      </div>
    </div>

    {!open&&error&&<p className="capsule-library-empty" role="alert">{l[7]}</p>}
    {!status ? <p className="capsule-library-empty" role="status">{l[14]}</p> :
      !active ? <p className="capsule-library-empty">{l[8]}</p> :
      <div className="capsule-library-browse">
        <nav className="capsule-library-categories" aria-label={l[13]}>
          <button type="button" data-capsule-group="all" aria-pressed={groupIndex<0}
            onClick={()=>{setGroupIndex(-1);setSearchScope("all");results.current?.scrollTo({top:0});}}>{paging[0]}</button>
          {capsuleBrowseGroups.map((entry,i)=><button type="button" key={entry.id} data-capsule-group={entry.id}
            aria-pressed={i===groupIndex&&(!q||searchScope==="group")} onClick={()=>{setGroupIndex(i);if(q)setSearchScope("group");results.current?.scrollTo({top:0});}}>
            {names[i]}
          </button>)}
        </nav>
        <div className="capsule-library-pane">
         <div className="capsule-library-heading"><div><h3>{q?l[10]:group?names[groupIndex]:paging[0]}</h3>
          <small>{(data??lastForScope)&&<>{(data??lastForScope)!.total.toLocaleString(locale)} {q?paging[6]:paging[7]} · </>}{q?(searchScope==="group"&&group?names[groupIndex]:l[12]):badges[6]}</small></div>
          <SelectMenu className="capsule-sort-select" ariaLabel={ordering[0]} label={ordering[0]} value={order}
            options={TAG_PACK_SORTS.map((value,i)=>({value,label:ordering[i+1]}))} onChange={changeOrder}/>
         </div>
         {q&&group&&<div className="capsule-search-scope" role="group" aria-label={paging[1]}>
           <button type="button" className="capsule-library-more" aria-pressed={searchScope==="all"} onClick={()=>setSearchScope("all")}>{paging[2]}</button>
           <button type="button" className="capsule-library-more" aria-pressed={searchScope==="group"} onClick={()=>setSearchScope("group")}>{paging[3]} · {names[groupIndex]}</button>
         </div>}
         <div ref={results} className="capsule-library-results" data-capsule-search-results={q?"":undefined} aria-busy={pending}>
          {pending?<p className="capsule-library-empty" role="status">{l[14]}</p>:
           !data?<div className="capsule-library-empty" role="alert"><p>{paging[8]}</p><button type="button" className="capsule-library-more" onClick={()=>setRetry(value=>value+1)}>{paging[9]}</button></div>:
           data.rows.length?<TagCards rows={data.rows} selected={selected} badges={badges} onPick={onPick}/>:
           <div className="capsule-library-empty"><p>{l[9]}</p>{q&&<button className="capsule-library-more" type="button" onClick={()=>onPick(q)}>{badges[5]}</button>}</div>}
         </div>
         {(data??lastForScope)?.total ? <div className="capsule-library-pagination">
          <button type="button" className="capsule-library-more" onClick={()=>changePage(page-1)} disabled={page===0}>{badges[2]}</button>
          <span aria-live="polite">{Math.min(page+1,numPages)} / {numPages}</span>
          <PageNumber page={Math.min(page,numPages-1)} total={numPages} label={paging[4]} go={paging[5]} onChange={changePage}/>
          <button type="button" className="capsule-library-more" onClick={()=>changePage(page+1)} disabled={page+1>=numPages}>{badges[3]}</button>
         </div>:null}
         <section className="capsule-related-strip" aria-label={ordering[4]}>
          <strong><Icon name="link" aria-hidden="true"/>{ordering[4]}</strong>
          {suggestions.length>0 ? <div className="capsule-related-chips">
            {suggestions.map(row=><button key={row.tag} data-capsule-related={row.tag} type="button" className="capsule-library-more" title={row.tag} onClick={()=>onPick(row.tag)}>
              <span>{row.description||row.tag}</span><small>{row.tag}</small></button>)}
          </div> : <small>{seedKey==="[]"?ordering[5]:related.key===relatedKey?ordering[6]:l[14]}</small>}
         </section>
        </div>
      </div>}
  </section>;
}
