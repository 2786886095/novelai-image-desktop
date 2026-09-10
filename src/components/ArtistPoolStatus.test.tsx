import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ArtistPoolStatus } from "./ArtistPoolStatus";
import type { ArtistPoolSnapshot } from "../artist-lab";
const snapshot: ArtistPoolSnapshot = { items: [], source: "empty", requested: 1000, rankedCount: 0, savedAt: null, issue: "timeout" };
it("shows the failure reason without offering static or cached candidates", () => {
  const html = renderToStaticMarkup(<ArtistPoolStatus snapshot={snapshot} loading={false} failed={false} language="zh-CN" />);
  expect(html).toContain("实时排行暂不可用"); expect(html).not.toContain("内置");
  expect(html).toContain("在线请求超时"); expect(html).toContain("未取得实时候选");
  expect(html).toContain('role="status"'); expect(html).not.toContain("1000");
});
it.each(["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"] as const)("renders refresh and IPC errors in %s", language => {
  const html = renderToStaticMarkup(<ArtistPoolStatus snapshot={snapshot} loading={false} failed={true} language={language} />);
  expect(html).toContain('data-warning="true"'); expect(html).not.toContain("undefined");
  const loading = renderToStaticMarkup(<ArtistPoolStatus snapshot={snapshot} loading={true} failed={false} language={language} />);
  expect(loading).not.toBe(html);
});
it("shows real page progress without inventing a total percentage", () => {
  const html=renderToStaticMarkup(<ArtistPoolStatus snapshot={null} loading={true} failed={false} language="zh-CN" progress={{requestId:"x",loaded:6005,pages:7,state:"retrying",retryAfterMs:5000}} />);
  expect(html).toContain("6,005");expect(html).toContain("7 页");expect(html).toContain("5 秒后重试");expect(html).not.toContain("%");expect(html).not.toContain("全库同步完成");
});
it("labels completion only for a fully exhausted scan, and cancellation is not a network error", () => {
  const done={...snapshot,source:"network" as const,issue:null,requested:"all" as const,complete:true,savedAt:10000,rankedCount:6005};
  expect(renderToStaticMarkup(<ArtistPoolStatus snapshot={done} loading={false} failed={false} language="zh-CN" />)).toContain("全库同步完成");
  const cancelled={...snapshot,issue:"cancelled" as const,complete:false};
  const html=renderToStaticMarkup(<ArtistPoolStatus snapshot={cancelled} loading={false} failed={false} language="zh-CN" />);
  expect(html).toContain("已取消同步");expect(html).not.toContain("请检查网络");expect(html).not.toContain("全库同步完成");
});
