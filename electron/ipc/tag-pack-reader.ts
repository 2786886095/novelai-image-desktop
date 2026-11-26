import { capsuleFacets } from "../../shared/capsule-facets";
import { relatedTagsForTopic } from "../../shared/related-tag-topics";
import { readFileSync, statSync } from "node:fs";
import {TAG_PACK_MANIFEST,TAG_BROWSE_GROUPS,TAG_BROWSE_PAGE_SIZE,type TagPackPage,type TagPackSort} from "../../shared/multilingual-tag-pack-contract";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { TagSuggestion } from "../../src/types";

export type TagDictionaryMatch = TagSuggestion & { query: string };
type Row = { tag: string; translated: string; count: number; category: number };
type Ranked = Row & { priority: number };
type Matched = {id:number;count:number;tag:string;priority:0|1|2|3};
// Match SQLite BINARY order when finalizing a tied cutoff in JavaScript.
function compareTag(a:string,b:string){
 if(a===b)return 0;
 if(/[\uD800-\uDFFF]/.test(a+b))return Buffer.compare(Buffer.from(a),Buffer.from(b));
 return a<b?-1:1;
}
function orderMatches(a:Matched,b:Matched,sort:TagPackSort) {
 if(sort==="alphabetical") {
  const k=fold(a.tag),j=fold(b.tag);
  return (k<j?-1:k>j?1:0)||b.count-a.count||a.id-b.id;
 }
 return (sort==="relevance"?a.priority-b.priority:0)||b.count-a.count||compareTag(a.tag,b.tag)||a.id-b.id;
}
const columns = ["key", "translated_key"] as const;
type Column = typeof columns[number];
const rowFields = "tag,translated,category,count";

function fold(value: string) {
  return value.normalize("NFKC").toLowerCase().replaceAll("_"," ").trim().replace(/\s+/g," ");
}

class Lru<V> {
  private items = new Map<string, V>();
  constructor(private readonly capacity: number) {}
  get(key: string) {
    const value = this.items.get(key);
    if (value !== undefined) {
      this.items.delete(key);
      this.items.set(key, value);
    }
    return value;
  }
  set(key: string, value: V) {
    if (this.items.size >= this.capacity) {
      const earliest = this.items.keys().next().value;
      if (earliest !== undefined) this.items.delete(earliest);
    }
    this.items.set(key, value);
  }
}

function suggestion(row: Row): TagSuggestion {
  return {tag:row.tag,description:row.translated,count:row.count,category:row.category,localizedDescription:true};
}

function prepare(db: DatabaseSync, column: Column) {
  return {
    exact: db.prepare("SELECT "+rowFields+" FROM terms WHERE "+column+"=? ORDER BY count DESC, tag LIMIT ?"),
    // The cutoff scans only (indexed term, count), not full rows and translations.
    // Read all rows tied at the cutoff before the existing lexical tie break.
    prefix: db.prepare(
      "WITH highest AS (SELECT count FROM terms WHERE "+column+">? AND "+column+"<? ORDER BY count DESC LIMIT ?) "+
      "SELECT "+rowFields+" FROM terms WHERE "+column+">? AND "+column+"<? AND count >= (SELECT min(count) FROM highest) "+
      "ORDER BY count DESC, tag LIMIT ?"
    ),
  };
}

type BrowseIndex={groups:Map<string,Uint32Array>;members:Map<string,Set<number>>};
let cachedBrowse: {path:string;data:BrowseIndex}|undefined;
function browseIndex(path:string,version:string):BrowseIndex {
  if(cachedBrowse?.path===path)return cachedBrowse.data;
  const buf=readFileSync(path);
  if(buf.toString("ascii",0,4)!=="LBT1")throw Error("Bad tag group index");
  const length=buf.readUInt32LE(4);
  if(length>4096||buf.length>8*1024*1024)throw Error("Invalid tag group index size");
  const meta=JSON.parse(buf.toString("utf8",8,8+length));
  if(meta.version!==version||!Number.isSafeInteger(meta.rows)||meta.rows<1)throw Error("Wrong tag group index version");
  const groups=new Map<string,Uint32Array>();
  let offset=8+length;
  for(const group of TAG_BROWSE_GROUPS){
    const count=meta.counts[group];
    if(!Number.isSafeInteger(count)||count<0||count>meta.rows||offset+4*count>buf.length)throw Error("Invalid tag group bounds");
    const ids=Uint32Array.from({length:count},()=>{const id=buf.readUInt32LE(offset);offset+=4;return id;});
    groups.set(group,ids);
  }
  if(offset!==buf.length)throw Error("Trailing tag group index data");
  const data={groups,members:new Map<string,Set<number>>()};
  cachedBrowse={path,data};
  return data;
}

class TagPackReader {
  private readonly db: DatabaseSync;
  private readonly statements: Record<Column,{exact:StatementSync;prefix:StatementSync}>;
  private readonly searches = new Lru<TagSuggestion[]>(96);
  private readonly pageRanks = new Lru<number[]>(8);
  private pageRow:StatementSync;
  private alphabeticIds:Uint32Array|undefined;
  private readonly alphabeticGroups=new Lru<Uint32Array>(5);
  private readonly totalMatches:StatementSync;
  private readonly totals=new Lru<number>(96);
  private readonly topicRows:StatementSync;
  private readonly contains:StatementSync;
  private readonly topContains:StatementSync;
  private matching:Record<Column,StatementSync>;
  private readonly exactLabels = new Lru<Row | null>(2048);

  constructor(file: string) {
    this.db = new DatabaseSync(file,{readOnly:true});
    try {
      this.db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-4096");
      this.statements={key:prepare(this.db,"key"),translated_key:prepare(this.db,"translated_key")};
      this.pageRow=this.db.prepare("SELECT "+rowFields+" FROM terms WHERE rowid=?");
      // instr is literal (unlike LIKE), so %, _ after folding, and punctuation
      // are not wildcard patterns. Keep exact label resolution on its own path.
      const contained=" FROM terms WHERE instr(key,?)>0 OR instr(translated_key,?)>0";
      this.topicRows=this.db.prepare("SELECT rowid AS id,count,tag FROM terms WHERE tag IN (SELECT value FROM json_each(?))");
      this.totalMatches=this.db.prepare("SELECT count(*) AS n"+contained);
      this.contains=this.db.prepare("SELECT rowid AS id,count,tag"+contained);
      this.topContains=this.db.prepare("SELECT "+rowFields+contained+" ORDER BY count DESC,tag LIMIT ?");
      this.matching={
        key:this.db.prepare("SELECT rowid AS id,count,tag,key AS term FROM terms WHERE key>=? AND key<?"),
        translated_key:this.db.prepare("SELECT rowid AS id,count,tag,translated_key AS term FROM terms WHERE translated_key>=? AND translated_key<?"),
      };
    } catch(error) {
      this.db.close();
      throw error;
    }
  }
  close() { this.db.close(); }

  search(word: string,n: number,sort:TagPackSort): TagSuggestion[] {
    const cacheKey=[n,word,sort].join("\0");
    const current=this.searches.get(cacheKey);
    if(current)return current.map(row=>({...row}));
    if (sort!=="relevance" || relatedTagsForTopic(word)) {
      const hits=this.matches(word).sort((a,b)=>orderMatches(a,b,sort)).slice(0,n)
        .map(({id})=>this.pageRow.get(id) as unknown as Row).map(suggestion);
      this.searches.set(cacheKey,hits);
      return hits.map(row=>({...row}));
    }
    const upper=word+String.fromCodePoint(0x10ffff);
    const byTag=new Map<string,Ranked>();
    for(const col of columns) {
      const exact=this.statements[col].exact.all(word,n) as unknown as Row[];
      for(const row of exact)byTag.set(row.tag,{...row,priority:0});
      const remaining=n-exact.length;
      if(!remaining)continue;
      const prefix=this.statements[col].prefix.all(word,upper,remaining,word,upper,remaining) as unknown as Row[];
      for(const row of prefix)if(!byTag.has(row.tag))byTag.set(row.tag,{...row,priority:1});
    }
    // A full prefix page already outranks every infix candidate.
    if(byTag.size<n){
      for(const row of this.topContains.all(word,word,n) as unknown as Row[]){
        if(!byTag.has(row.tag))byTag.set(row.tag,{...row,priority:2});
      }
    }
    const result=[...byTag.values()].sort((a,b)=>a.priority-b.priority||b.count-a.count||compareTag(a.tag,b.tag))
      .slice(0,n).map(suggestion);
    this.searches.set(cacheKey,result);
    return result.map(row=>({...row}));
  }

  private matches(word:string,members?:Set<number>):Matched[] {
    const best=new Map<number,Matched>();
    const upper=word+String.fromCodePoint(0x10ffff);
    for(const column of columns) {
      // Iterate index rows; do not load translations for every candidate.
      for(const row of this.matching[column].iterate(word,upper)) {
        const {id,count,tag,term}=row as unknown as {id:number;count:number;tag:string;term:string};
        if(members&&!members.has(id))continue;
        const priority=term===word?0:1;
        if(!best.has(id)||priority===0)best.set(id,{id,count,tag,priority});
      }
    }
    for(const row of this.contains.iterate(word,word)){
      const {id,count,tag}=row as unknown as {id:number;count:number;tag:string};
      if(!best.has(id)&&(!members||members.has(id)))best.set(id,{id,count,tag,priority:2});
    }
    const related=relatedTagsForTopic(word);
    if(related){
      for(const row of this.topicRows.iterate(JSON.stringify([...related]))){
        const {id,count,tag}=row as unknown as {id:number;count:number;tag:string};
        if(!best.has(id)&&(!members||members.has(id)))best.set(id,{id,count,tag,priority:3});
      }
    }
    return [...best.values()];
  }

  page(path:string,group:string,query:string,page:number,sort:TagPackSort,indexVersion:string):TagPackPage {
    const index=browseIndex(path,indexVersion);
    const facet = group.startsWith("facet:") && capsuleFacets.find(f=>"facet:"+f.id===group);
    let listed=index.groups.get(group);
    if(facet && !query.trim()) {
      // Keep the pack's existing browsable universe, exclusion rules and relevance order.
      const pool=index.groups.get("all");
      if(pool){
        const key="facet:"+facet.id;
        let matches=this.pageRanks.get(key);
        if(!matches){
          const predicate=facet.words.map(()=>"instr(' ' || key || ' ', ?) > 0").join(" OR ");
          const rows=this.db.prepare("SELECT rowid AS id FROM terms WHERE category=0 AND ("+predicate+")").all(...facet.words.map(w=>" "+w+" "));
          const ids=new Set(rows.map(r=>Number(r.id)));
          matches=Array.from(pool).filter(id=>ids.has(id));this.pageRanks.set(key,matches);
        }
        listed=Uint32Array.from(matches);
      }
    }
    if(!listed)return {rows:[],total:0,page:0};
    const word=fold(query.slice(0,255));
    // Autocomplete opens on page zero. Count literally matched rows, but do not
    // allocate and sort hundreds of thousands of IDs just to display 24 tags.
    if(word && !relatedTagsForTopic(word) && group==="all" && page===0 && sort==="relevance"){
      let total=this.totals.get(word);
      if(total===undefined){
        total=Number(this.totalMatches.get(word,word)?.n);
        this.totals.set(word,total);
      }
      return {rows:total?this.search(word,TAG_BROWSE_PAGE_SIZE,sort):[],total,page:0};
    }
    let ids:readonly number[]|Uint32Array=listed;
    if(word){
      const cacheKey=[path,group,word,sort].join("\0");
      let ranks=this.pageRanks.get(cacheKey);
      if(!ranks){
        let members=index.members.get(group);
        if(!members&&group!=="all"){members=new Set(listed);index.members.set(group,members);}
        ranks=this.matches(word,members).sort((a,b)=>orderMatches(a,b,sort)).map(row=>row.id);
        this.pageRanks.set(cacheKey,ranks);
      }
      ids=ranks;
    } else if(sort==="alphabetical") {
      const cacheKey=path+"\0"+group;
      let ordered=this.alphabeticGroups.get(cacheKey);
      if(!ordered) {
        const members=index.members.get(group)??new Set(listed);
        if(!this.alphabeticIds) {
          const records=this.db.prepare("SELECT rowid AS id FROM terms ORDER BY key ASC,count DESC,rowid").all();
          this.alphabeticIds=Uint32Array.from(records,row=>Number(row.id));
        }
        ordered=this.alphabeticIds.filter(id=>members.has(id));
        this.alphabeticGroups.set(cacheKey,ordered);
      }
      ids=ordered;
    }
    const total=ids.length,max=Math.max(0,Math.ceil(total/TAG_BROWSE_PAGE_SIZE)-1);
    const safe=Number.isSafeInteger(page)?Math.max(0,Math.min(page,max)):0;
    const start=safe*TAG_BROWSE_PAGE_SIZE, rows:TagSuggestion[]=[];
    for(const id of ids.slice(start,start+TAG_BROWSE_PAGE_SIZE)){
      const row=this.pageRow.get(id) as unknown as Row|undefined;
      if(row)rows.push(suggestion(row));
    }
    return {rows,total,page:safe};
  }

  lookup(keys: string[], includeTranslation: boolean): TagDictionaryMatch[] {
    const matches: TagDictionaryMatch[]=[];
    for(const query of keys) {
      const cacheKey=(includeTranslation?"both:":"canonical:")+query;
      let row=this.exactLabels.get(cacheKey);
      if(row===undefined) {
        row=(this.statements.key.exact.get(query,1) as unknown as Row|undefined) ?? null;
        if(!row&&includeTranslation) {
          const translated=this.statements.translated_key.exact.all(query,2) as unknown as Row[];
          // A homonym is useful in browsing, not in automatic prompt hints.
          if(translated.length===1)row=translated[0];
        }
        this.exactLabels.set(cacheKey,row);
      }
      if(row)matches.push({query,...suggestion(row)});
    }
    return matches;
  }
}

// One database connection, two sets of reusable statements and bounded caches.
// Data filename alone is not an identity: reinstalling the same language
// invalidates both statement and result caches, including negative hits.
let current: {file:string;identity:string;reader:TagPackReader} | undefined;
export function closeTagPackReader(file?: string) {
  if(current&&(file===undefined||current.file===file)) {
    const stale=current; current=undefined; stale.reader.close();
  }
}
function readerFor(file: string) {
  const stat=statSync(file,{bigint:true});
  const identity=[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(":");
  if(current?.file===file&&current.identity===identity)return current.reader;
  closeTagPackReader();
  const reader=new TagPackReader(file);
  current={file,identity,reader};
  return reader;
}

export function searchTagPackDatabase(file: string, query: string, limit: number, sort:TagPackSort="relevance"): TagSuggestion[] {
  const word=fold(query.slice(0,255));
  if(!word)return [];
  const n=Number.isSafeInteger(limit)?Math.max(1,Math.min(200,limit)):20;
  return readerFor(file).search(word,n,sort);
}

export function browseTagPackDatabase(file:string,index:string,group:string,query:string,page:number,sort:TagPackSort="relevance",indexVersion=TAG_PACK_MANIFEST.updatedAt):TagPackPage {
  return readerFor(file).page(index,group,query,page,sort,indexVersion);
}

export function lookupTagPackDatabase(file: string, input: readonly string[], includeTranslation=false): TagDictionaryMatch[] {
  const keys=[...new Set(input.slice(0,512).filter(key=>typeof key==="string")
    .map(key=>fold(key.slice(0,128))).filter(Boolean))];
  if(!keys.length)return [];
  return readerFor(file).lookup(keys,includeTranslation);
}
