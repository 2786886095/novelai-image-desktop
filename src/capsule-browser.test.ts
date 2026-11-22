import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {browseTags,capsuleBrowseGroups,capsuleDirectory} from "./components/CapsuleTagBrowser";
import {TAG_PACK_MANIFEST} from "../shared/multilingual-tag-pack-contract";
import {CAPSULE_TAXONOMY} from "./prompt-data";
import snapshot from "../shared/tag-pack-browse.json";

describe("capsule dictionary browse",()=>{
  it("uses exactly the source's 17 ranked categories for the current dictionary",()=>{
    expect(snapshot.updatedAt).toBe(TAG_PACK_MANIFEST.updatedAt);
    expect(capsuleBrowseGroups).toHaveLength(17);
    capsuleBrowseGroups.forEach((g,i)=>{
      expect(g.source).toMatch(new RegExp("^"+String(i).padStart(2,"0")+"_.*_20261116\\.csv$"));
      expect(g.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(g.tags).toHaveLength(snapshot.previewLimit);
      expect(new Set(g.tags).size).toBe(g.tags.length);
    });
    expect(capsuleBrowseGroups[1].tags[0]).toBe("long_hair");
    expect(capsuleBrowseGroups[8].tags[0]).toBe("looking_at_viewer");
  });
  it("takes renderer labels from the active pack without injecting old category translations",()=>{
    const hit={tag:"long_hair",description:"ロングヘアー",count:4,category:0,localizedDescription:true};
    const index=new Map([["long hair",hit]]);
    expect(browseTags(capsuleBrowseGroups[1],index)).toEqual([hit]);
    expect(browseTags(capsuleBrowseGroups[1],new Map())).toEqual([]);
  });
  it("links the six character shortcuts to the original subgroups without changing the search corpus",()=>{
    expect(capsuleDirectory.map(x=>x.name)).toEqual(CAPSULE_TAXONOMY.map(x=>x.name));
    const role=capsuleDirectory.find(x=>x.name==="人物")!;
    expect(role.subgroups.slice(0,6).map(x=>x.name)).toEqual(["对象","体型","上衣","下装","眼睛","配饰"]);
    const body=CAPSULE_TAXONOMY.find(x=>x.name==="人物")!, clothes=CAPSULE_TAXONOMY.find(x=>x.name==="服饰")!;
    expect(body.subgroups.some(g=>g.name==="上衣")).toBe(false);
    expect(new Set(role.subgroups.map(g=>g.name)).size).toBe(role.subgroups.length);
    for(const g of [...body.subgroups,...clothes.subgroups]){
      expect(role.subgroups.find(x=>x.name===g.name)?.tags).toBe(g.tags);
    }
    for(const other of CAPSULE_TAXONOMY.filter(c=>c!==body))expect(capsuleDirectory.find(c=>c.name===other.name)).toBe(other);
  });
  it("wires the same capsule browser into general and character prompt tools",()=>{
    const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf-8");
    expect(app.match(/<CapsuleTagBrowser /g)).toHaveLength(2);
    expect(app).not.toContain("CAPSULE_TAXONOMY");
    expect(app.match(/<TagPackSettings \/>/g)).toHaveLength(2);
  });
});
