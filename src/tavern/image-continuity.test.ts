import drawFixtures from "../../shared/tavern-style-draw-fixtures.json";
import { describe, expect, it } from "vitest";
import fixtures from "../../shared/tavern-continuity-fixtures.json";
import type { AgentMessage, TavernImageProposal } from "../agent/types";
import { effectiveContextMessages, createContextSnapshot, shouldAutoCompact, planContextCompaction } from "../agent/context";
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
  it("retains exact image state while compacting ordinary text and still honors an explicit image reset", () => {
    const exact = { ...base, positivePrompt: 'red coat, white shirt, 1.25::precise tag::',
      stylePrompt: '0.8::watercolor::', negativePrompt: 'blur, extra fingers', width: 832, height: 1216 };
    const history = [message('ordinary'), message('image', exact)];
    const before = structuredClone(history);
    const boundary = '2026-09-08T01:00:00.000Z';
    const effective = effectiveContextMessages(history, 'A short summary', boundary);
    expect(effective.map(item => item.id)).toEqual([`context-summary-${boundary}`, 'image']);
    expect(effective[1].imageProposal).toEqual(exact);
    expect(history).toEqual(before);
    expect(imageStateContext(latestImageState(effective))).toContain(exact.positivePrompt);
    expect(latestImageState(effective)).toEqual(latestImageState(history));
    expect(latestImageState(effective, undefined, undefined, boundary)).toBeUndefined();
    // Reset controls image selection; it must not delete the durable receipt.
    expect(effective[1].imageProposal).toEqual(exact);
    expect(createContextSnapshot(effective, 8192, 0.8).used)
      .toBeGreaterThan(createContextSnapshot(effective.slice(0, 1), 8192, 0.8).used);
  });
  it.each(['cancelled', 'error', 'review-required'] as const)("retains %s image receipts but never promotes them to the authoritative image after compaction", state => {
    const candidate: TavernImageProposal = { ...base, id: 'unsafe', positivePrompt: 'unconfirmed blue coat',
      status: state === 'review-required' ? 'pending' : state,
      ...(state === 'review-required' ? { continuity: { reviewRequired: true, changes: [] } } : {}) };
    const history = [message('valid', base), message('unsafe', candidate),
      { ...message('cancelled-tool'), status: 'aborted' as const, tools: [{ id: 'paid', name: 'langbai_generate_image', title: 'paid', status: 'error' as const, output: 'uncertain; do not retry' }] }];
    const saved = JSON.parse(JSON.stringify(history));
    const effective = effectiveContextMessages(saved, 'Summary cannot authorize an image', '2026-09-08T01:00:00.000Z');
    expect(effective.slice(1)).toEqual(history);
    expect(latestImageState(effective)?.id).toBe(base.id);
    expect(effective.at(-1)?.tools[0].output).toBe('uncertain; do not retry');
  });
  it("the actual compaction plan excludes protected images and preserves their exact state through save/load", () => {
    const history = Array.from({ length: 20 }, (_, index) => ({ ...message(`turn-${index}`, index === 2 ? base : undefined),
      content: `ordinary text ${index}`, createdAt: new Date(Date.UTC(2026, 8, 8, 0, index)).toISOString() }));
    const before = structuredClone(history);
    const plan = planContextCompaction({ messages: history })!;
    expect(plan.messages).toHaveLength(13);
    expect(plan.messages.some(item => item.id === 'turn-2')).toBe(false);
    expect(plan.transcript).toContain('ordinary text 0');
    expect(plan.transcript).not.toContain('ordinary text 2\n');
    const saved = JSON.parse(JSON.stringify({ messages: history, lastSummary: 'compressed ordinary text', lastCompactedAt: plan.boundary }));
    const effective = effectiveContextMessages(saved.messages, saved.lastSummary, saved.lastCompactedAt);
    expect(effective.slice(1).map(item => item.id)).toEqual(['turn-2', ...history.slice(14).map(item => item.id)]);
    expect(effective[1].imageProposal).toEqual(base);
    expect(latestImageState(effective)).toEqual(base);
    expect(history).toEqual(before);
  });
  it("holds invalid candidate out of the next image state", () => {const pending={...base,id:"bad",continuity:{reviewRequired:true,changes:[]}};expect(latestImageState([message("old",base),message("pending",pending)])?.id).toBe("base");});
  it("does not use later images when regenerating an older reply",()=>expect(latestImageState([message("old",base),message("target"),message("future",{...base,id:"future"})],undefined,"target")?.id).toBe("base"));
  it("restores each alternative reply's own prompt",()=>{const m={...message("reply",base),swipes:["one","two"],swipeIndex:0,imageProposalSwipes:[base,{...base,id:"two",positivePrompt:"blue shirt"}]};selectImageSwipe(m,1);expect(m.imageProposal?.positivePrompt).toBe("blue shirt");selectImageSwipe(m,0);expect(m.imageProposal?.positivePrompt).toBe(base.positivePrompt);});
  it("draws reproducibly without changing the input pool or fixed style",()=>{const pool=["watercolor","lineart","soft lighting"];const copy=[...pool];const a=drawStyleTags(pool,["lineart"],1,0.2,1.2,42);expect(a).toBe(drawStyleTags(pool,["lineart"],1,0.2,1.2,42));expect(a).toContain("::lineart::");expect(pool).toEqual(copy);expect(appendStylePrompt("1.2::artist:name::",a)).toBe("1.2::artist:name::, "+a);});
  it("leaves an empty style empty until the user applies something",()=>{expect(appendStylePrompt("","")).toBe("");expect(drawStyleTags([],[],3,.2,1.2,1)).toBe("");expect(drawStyleTags(["lineart"],[],1,0,0,0)).toBe("0::lineart::");});
});

for (const f of drawFixtures) it(`shared draw seed ${f.seed}`, () => expect(drawStyleTags(f.tags,f.pinned,f.count,f.min,f.max,f.seed)).toBe(f.expected));
