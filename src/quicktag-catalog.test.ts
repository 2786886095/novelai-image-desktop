import {describe,it,expect} from "vitest";
import {quickCategories,quickCatalogNavigation,quickResolveCollection} from "./quicktag";
import fixture from "../shared/quicktag-catalog-fixtures.json";
describe("published QuickTagCloud sections and complete directories",()=>{
 it("retains all types, counts and explicit filtering",()=>{
  const full=quickCatalogNavigation(fixture.catalog,false),safe=quickCatalogNavigation(fixture.catalog,true);
  expect(full.catalogTotal).toBe(6);expect(full.catalogEntries).toBe(7);expect(full.hiddenCollections).toBe(0);
  expect(full.groups.map(g=>g.id)).toEqual(['codex','string','composition','pack','future-type']);
  expect(safe.groups[0]).toEqual({id:'codex',count:2,visible:1,entries:2});expect(safe.hiddenCollections).toBe(1);
 });
 it("retains published ordering, empty paths and unlisted entry paths",()=>{
  const categories=quickCategories(fixture.entries,fixture.tree,fixture.emptyCategories);
  expect(categories.map(c=>c.path)).toEqual(fixture.expectedPaths);
  expect(categories.map(c=>c.count)).toEqual([1,1,1,0,0,0,1]);
  expect(fixture.entries[0].tags).toBe('  blue coat  ');
 });
 it("resolves legacy collection links but rejects ambiguous aliases",()=>{
  expect(quickResolveCollection(fixture.catalog,'old-style')).toBe('style');
  expect(()=>quickResolveCollection([...fixture.catalog,{id:'duplicate',aliases:['old-style']}],'old-style')).toThrow('ambiguous');
 });
});
