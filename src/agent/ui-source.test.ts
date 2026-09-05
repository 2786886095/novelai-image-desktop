import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("Character Tavern desktop UI", () => {
  it("uses virtualized Markdown chat with collapsible side rails", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "AgentPage.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");

    expect(source).toContain("useVirtualizer");
    expect(source).toContain("ReactMarkdown");
    expect(source).toContain("remarkGfm");
    expect(source).toContain("rehypeSanitize");
    expect(source).toContain("setLeftCollapsed");
    expect(source).toContain("setRightCollapsed");
    expect(source).toContain("lastLayoutSignature");
    expect(source).toContain("followLatestRef");
    expect(source).toContain("seenMessageIdsRef");
    expect(source).toContain("tavern-run-strip");
    expect(source).toContain('animate ? "is-entering" : ""');
    expect(styles).toContain(".tavern-page");
    expect(styles).toContain(".tavern-message");
    expect(styles).toContain(".tavern-message.is-character .tavern-message-body");
    expect(styles).toContain(".tavern-run-strip");
    expect(styles).toContain("html.motion-reduced *");
    expect(styles).not.toContain("prefers-reduced-motion");
  });

  it("exposes SillyTavern card formats and both image-generation modes", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "AgentPage.tsx"), "utf8");
    expect(source).toContain('onExport("png")');
    expect(source).toContain('onExport("json")');
    expect(source).toContain('onExport("charx")');
    expect(source).toContain('generationMode = "confirm"');
    expect(source).toContain('generationMode = "auto"');
    expect(source).not.toContain("OpenCode");
  });

  it("shares Material icon semantics and protects the built-in image kit", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "AgentPage.tsx"), "utf8");
    const icons = fs.readFileSync(path.join(projectRoot, "src", "tavern", "MaterialIcons.tsx"), "utf8");
    expect(source).toContain('from "./tavern/MaterialIcons"');
    expect(source).not.toContain("react-icons/lu");
    expect(icons).toContain('from "react-icons/md"');
    expect(source).toContain("SOFTWARE_IMAGE_CHARACTER_ID");
    expect(source).toContain("SOFTWARE_IMAGE_LOREBOOK_ID");
    expect(source).toContain('tx("deleteLorebook")');
    expect(source).toContain('tx("builtInProtected")');
  });

  it("keeps the transcript flat and media controls compact", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "AgentPage.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");

    expect(source).toContain('proposalDraft.status !== "completed"');
    expect(source).toContain('aria-label={tx("openLocation")}');
    expect(source).toContain("onDelete={() => onDeleteMessage(message)}");
    expect(source).not.toContain("<span>打开位置</span>");
    expect(source).not.toContain("<span>另存为</span>");
    expect(styles).toContain(".tavern-style-hover-preview");
    expect(styles).toContain("width: fit-content;");
    expect(source).toContain('className="style-preset-menu tavern-shared-style-menu"');
    expect(source).toContain('className="style-preset-hover-preview"');
    expect(source).toContain("reconcileStylePromptPresetImages");
    expect(source).toContain("importSelectedStylePreview");
    expect(source).toContain("currentScroller.scrollHeight <= currentScroller.clientHeight + 4");
    expect(source).toContain("messages.length > 40");
    expect(source).toContain('tavern-virtual-list ${useVirtualRows ? "" : "is-static"}');
    expect(styles).toContain(".tavern-virtual-list.is-static .tavern-virtual-row");
    expect(source).toContain('tx("noReference")');
    expect(styles).toContain("max-width: min(100%, 380px);");
  });
});
