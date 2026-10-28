import {describe,it,expect} from "vitest";
import {anlasBillingDisplay,visibleAnlasQuote} from "./anlas-billing";
import type {AnlasQuoteResult} from "./types";
const relay=(amount=29):AnlasQuoteResult=>({ok:true,amount,referenceAmount:amount,billingContext:"independent-relay",accountId:"fixture-relay",source:"estimate-formula",message:"Synthetic reference only"});
describe("Anlas preview billing provenance",()=>{
 it.each([0,29])("never calls independent relay reference %i a debit or free generation",amount=>{
  const view=anlasBillingDisplay({quote:relay(amount),language:"zh-CN"});
  expect(view.primary).toBe("实际费用未知");expect(view.isReferenceOnly).toBe(true);
  expect(view.secondary).toContain(String(amount));expect(view.secondary).toContain("非中转报价");expect(view.secondary).toContain("Opus");
 });
 it("keeps estimated zero qualified, and official API a pre-generation quote",()=>{
  const quote:AnlasQuoteResult={ok:true,amount:0,referenceAmount:29,source:"estimate-formula",accountId:"fixture-official",message:"Fixture"};
  expect(anlasBillingDisplay({quote,language:"zh-CN"}).primary).toContain("估算");
  expect(anlasBillingDisplay({quote:{...quote,source:"official-api"},language:"zh-CN"}).sourceLabel).toBe("NovelAI 官方生成前报价（非实际扣费）");
 });
 it("renders separate relay/reference semantics",()=>{
  const view=anlasBillingDisplay({quote:relay(0),language:"zh-CN"});expect(view.title).toBeTruthy();expect(view.sourceLabel).toBeTruthy();expect(view.isReferenceOnly).toBe(true);expect(view.primary).not.toContain("0 Anlas");expect(view.secondary).toContain("0 Anlas");expect(view.secondary).toContain("Opus");
 });
 it("hides stale key and rejects late cross-identity quote before a repaint",()=>{
  const state={key:"current-key",quote:relay()};expect(visibleAnlasQuote(state,"other-key","fixture-relay")).toBeNull();expect(visibleAnlasQuote(state,"current-key","other-account")).toBeNull();expect(visibleAnlasQuote(state,"current-key","fixture-relay")).toBe(state.quote);
 });
 it("keeps unavailable image/params errors and does not invent a reference number",()=>{
  const view=anlasBillingDisplay({quote:{ok:false,source:"unavailable",reason:"missing-image",message:"Fixture",billingContext:"independent-relay"},language:"zh-CN"});expect(view.primary).toBe("请先加载要放大的图片");expect(view.secondary).toBe("");
 });
});
