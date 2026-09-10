import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { explicitlyRequestsImage, imageOutcomeText } from "./image-outcome";

describe("image failure feedback", () => {
  it("distinguishes explicit generation from discussion and cancelled intent", () => {
    for (const text of ["请生成一张森林图片", "帮我画一个城堡", "生图", "Please generate an image of a forest", "イラストを描いて", "이미지를 생성해 주세요"]) expect(explicitlyRequestsImage(text),text).toBe(true);
    for (const text of ["你好", "这张图片是什么风格？", "生成的图片很好看", "画面构图怎么样？", "生成参数如何设置？", "不要生成图片", "Don't generate an image", "How do I generate an image?"]) expect(explicitlyRequestsImage(text),text).toBe(false);
  });
  it("provides both failure stages and actions in all application languages", () => {
    for (const language of ["zh-CN","zh-TW","en-US","ja-JP","ko-KR"]) {
      expect(Object.values(imageOutcomeText(language)).every(value=>value.trim().length>0)).toBe(true);
      expect(imageOutcomeText(language).proposalTitle).not.toBe(imageOutcomeText(language).generationTitle);
    }
  });
  it("routes durable error events into a focused top-level dialog rather than only a banner", () => {
    const page=fs.readFileSync(path.resolve('src/AgentPage.tsx'),'utf8');
    const dialog=fs.readFileSync(path.resolve('src/agent/ImageFailureDialog.tsx'),'utf8');
    expect(page).toContain('event.kind === "image-error"');expect(page).toContain('reportImageFailure(event)');
    expect(page).toContain('<ImageFailureDialog');expect(dialog).toContain('role="alertdialog"');
    expect(dialog).toContain('document.body');expect(dialog).toContain('event.key === "Tab"');
    expect(dialog).toContain('previous.focus({ preventScroll: true })');
    expect(dialog).toContain('"--surface": "var(--bg-canvas)"');
    expect(page).toContain('messageId: "send-preflight"');expect(page).toContain('messageId: "send-transport"');
  });
});

it('accepts only unambiguous image repeat commands',async()=>{
 const {isRepeatImageRequest}=await import('./image-outcome');
 for(const text of ['重新生成','请重新生成图片！','再来一张','generate again','Please regenerate the image.','もう一度生成','이미지 다시 생성']) expect(isRepeatImageRequest(text),text).toBe(true);
 for(const text of ['重新生成回复','重新生成，改成蓝衣服','重新生成？','不要重新生成','这个重新生成是什么意思','generate another image with a red coat']) expect(isRepeatImageRequest(text),text).toBe(false);
});

it('separates sending from disclosure interactions when following a pending image plan',()=>{
 const page=fs.readFileSync(path.resolve('src/AgentPage.tsx'),'utf8');
 expect(page).toContain('setFollowRequest(value => value + 1)');expect(page).toContain('followRequest={followRequest}');
 expect(page).toContain('if (!followRequest) return;');expect(page).toContain('}, [followRequest]);');
 expect(page).toContain('!lastRow.querySelector(".tavern-proposal-toolbar .is-primary")');
 expect(page).toContain('tavern-proposal-stage');
});
