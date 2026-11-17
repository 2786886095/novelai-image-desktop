import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {browseTags,capsuleBrowseGroups} from "./components/CapsuleTagBrowser";
import {TAG_PACK_MANIFEST} from "../shared/multilingual-tag-pack-contract";
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
  it("wires the same capsule browser into general and character prompt tools",()=>{
    const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf-8");
    expect(app.match(/<CapsuleTagBrowser /g)).toHaveLength(2);
    expect(app).not.toContain("CAPSULE_TAXONOMY");
    expect(app.match(/<TagPackSettings \/>/g)).toHaveLength(2);
  });
});
