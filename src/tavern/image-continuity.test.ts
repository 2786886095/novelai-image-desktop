import drawFixtures from "../../shared/tavern-style-draw-fixtures.json";
import { describe, expect, it } from "vitest";
import fixtures from "../../shared/tavern-continuity-fixtures.json";
import type { AgentMessage, TavernImageProposal } from "../agent/types";
import { effectiveContextMessages, createContextSnapshot, shouldAutoCompact } from "../agent/context";
import { imageStateContext, latestImageState, resolveImagePrompt, selectImageSwipe } from "./image-continuity";
import { appendStylePrompt, drawStyleTags } from "./style-draw";
const base = fixtures[0].base as TavernImageProposal;
const message = (id: string, imageProposal?: TavernImageProposal): AgentMessage => ({ id, role: "assistant", content: "Scene", status: "complete", attachments: [], tools: [], imageProposal, createdAt: "2026-09-08T00:00:00.000Z" });
describe("native image continuity contract", () => {
  for (const f of fixtures) it(f.name, () => { const result=resolveImagePrompt(f.raw, f.base as TavernImageProposal ?? undefined); expect(result.positivePrompt).toBe(f.expected); expect(result.continuity.reviewRequired).toBe(f.review); });
  it("preserves clothing across 30 edits under 40% context and a save/load", () => {
    let current=base;
    for(let i=0;i<30;i++) {const r=resolveImagePrompt({baseImageId:current.id,promptPatch:{replacements:[],append:[`scene detail ${i}`]}},current);current=JSON.parse(JSON.stringify({...current,...r,id:`image-${i}`}));expect(current.positivePrompt).toContain("red coat, white shirt");}
    const snapshot=createContextSnapshot([message("latest",current)],1048576,0.88); expect(snapshot.percent).toBeLessThan(40);expect(shouldAutoCompact(snapshot,true,0.88)).toBe(false);
  });
  it("injects exact latest image independently of text compaction", () => {
    const history=[message("old",base)]; expect(effectiveContextMessages(history,"A short summary","2026-09-08T01:00:00.000Z")).toHaveLength(1);
    expect(imageStateContext(latestImageState(history))).toContain(base.positivePrompt);
    expect(latestImageState(history,undefined,undefined,"2026-09-08T01:00:00.000Z")).toBeUndefined();
  });
  it("holds invalid candidate out of the next image state", () => {const pending={...base,id:"bad",continuity:{reviewRequired:true,changes:[]}};expect(latestImageState([message("old",base),message("pending",pending)])?.id).toBe("base");});
  it("does not use later images when regenerating an older reply",()=>expect(latestImageState([message("old",base),message("target"),message("future",{...base,id:"future"})],undefined,"target")?.id).toBe("base"));
  it("restores each alternative reply's own prompt",()=>{const m={...message("reply",base),swipes:["one","two"],swipeIndex:0,imageProposalSwipes:[base,{...base,id:"two",positivePrompt:"blue shirt"}]};selectImageSwipe(m,1);expect(m.imageProposal?.positivePrompt).toBe("blue shirt");selectImageSwipe(m,0);expect(m.imageProposal?.positivePrompt).toBe(base.positivePrompt);});
  it("draws reproducibly without changing the input pool or fixed style",()=>{const pool=["watercolor","lineart","soft lighting"];const copy=[...pool];const a=drawStyleTags(pool,["lineart"],1,0.2,1.2,42);expect(a).toBe(drawStyleTags(pool,["lineart"],1,0.2,1.2,42));expect(a).toContain("::lineart::");expect(pool).toEqual(copy);expect(appendStylePrompt("1.2::artist:name::",a)).toBe("1.2::artist:name::, "+a);});
  it("leaves an empty style empty until the user applies something",()=>{expect(appendStylePrompt("","")).toBe("");expect(drawStyleTags([],[],3,.2,1.2,1)).toBe("");expect(drawStyleTags(["lineart"],[],1,0,0,0)).toBe("0::lineart::");});
});

for (const f of drawFixtures) it(`shared draw seed ${f.seed}`, () => expect(drawStyleTags(f.tags,f.pinned,f.count,f.min,f.max,f.seed)).toBe(f.expected));
