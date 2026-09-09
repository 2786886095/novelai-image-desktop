import { describe,it,expect } from "vitest";
import fixture from "../shared/quicktag-fixtures.json";
import {quickPathCode,quickCategories,quickLink,quickSourceUrl,quickMatch,quickSafe,quickCharacters} from "./quicktag";
describe("QuickTagCloud URL and directory compatibility",()=>{
  it("resolves the supplied directory code without treating it as an entry ID",()=>{
    const path=["画风组词典","梦神NAI5F画风合集"];
    expect(quickPathCode(path)).toBe("zuud7l");
    expect(quickLink("https://novelai.quicktagcloud.com/?c=artist_nai5_personal&p=zuud7l")).toMatchObject({collectionId:"artist_nai5_personal",code:"zuud7l",entry:""});
    expect(quickLink(quickSourceUrl("demo","a/b",path))?.entry).toBe("a/b");
  });
  it("counts every visible prefix and preserves source tag text",()=>{
    const entries=fixture.books.artist_nai5_personal.entries.filter(quickSafe);
    expect(entries).toHaveLength(2);
    expect(quickCategories(entries).find((c)=>c.code==="zuud7l")?.count).toBe(1);
    expect(entries[0].tags).toBe("watercolor, blue sky");
    expect(quickMatch(entries[0],'watercolor "blue sky" -pencil')).toBe(true);
    expect(quickMatch(entries[0],'watercolor pencil')).toBe(false);
  });
  it("preserves separate character blocks and searches their tags",()=>{
    const entry={characterPrompts:[{label:"A",prompt:"  blue coat  "},{label:"B",prompt:"red scarf"},{prompt:0}]};
    expect(quickCharacters(entry)).toEqual(entry.characterPrompts.slice(0,2));
    expect(quickMatch(entry,'"blue coat" "red scarf"')).toBe(true);
    expect(quickCharacters(null)).toEqual([]);
  });
  it("accepts legacy codex links and rejects unrelated hosts",()=>{
    expect(quickLink("https://novelai.quicktagcloud.com/?codex=demo&path=服装")?.path).toEqual(["服装"]);
    expect(()=>quickLink("https://example.com/?c=demo")).toThrow();
    expect(quickLink("blue coat")).toBeUndefined();
  });
});
