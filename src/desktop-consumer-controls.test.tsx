import { readFileSync } from "node:fs";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  portal: null as unknown,
  release: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("react-dom", () => ({ createPortal: (node: unknown) => { h.portal = node; return node; } }));
vi.mock("./store", () => ({ useAppStore: { getState: () => ({ settings: { language: "en-US" } }), subscribe: () => h.unsubscribe } }));
vi.mock("./motion-system", () => ({ manageModalPortal: () => h.release, motionReduced: () => true }));
import { ImageFailureDialog } from "./agent/ImageFailureDialog";
import { confirmAction } from "./components/confirm";

function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, any>>;
  return [element, ...elements(element.props.children)];
}

// This deliberately small DOM fixture exercises the real confirmation method.
// It is not a browser geometry, animation, or native keyboard acceptance test.
function confirmationFixture() {
  const handlers = new Map<string, (event: any) => void>();
  const nodes = new Map<string, any>();
  const document = { activeElement: null as unknown, createElement: () => backdrop, body: { appendChild: vi.fn() } };
  const backdrop: any = {
    inert: false, style: {}, classList: { add: vi.fn(), remove: vi.fn() },
    setAttribute: vi.fn(), remove: vi.fn(),
    addEventListener: (kind: string, callback: (event: any) => void) => handlers.set(kind, callback),
    querySelector: (selector: string) => nodes.get(selector),
    querySelectorAll: () => [nodes.get('[data-result="cancel"]'), nodes.get('[data-result="confirm"]')],
    set innerHTML(value: string) {
      for (const selector of ["h3", "p"]) nodes.set(selector, { textContent: "" });
      for (const match of value.matchAll(/<button\b([^>]*)><\/button>/g)) {
        const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], item[2]]));
        const selector = `[data-result="${attrs["data-result"]}"]`;
        const button: any = { attrs, textContent: "", focus: () => { document.activeElement = button; }, closest: (test: string) => test === selector ? button : null };
        nodes.set(selector, button);
      }
    },
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => { callback(); return 1; }, cancelAnimationFrame: vi.fn(), setTimeout: (callback: () => void) => { callback(); return 1; } });
  return { document, backdrop, handlers, cancel: () => nodes.get('[data-result="cancel"]'), confirm: () => nodes.get('[data-result="confirm"]') };
}

beforeEach(() => { vi.clearAllMocks(); h.portal = null; });
afterEach(() => vi.unstubAllGlobals());

describe("ordinary desktop action consumers use shared button semantics", () => {
  it("renders both image-failure actions with shared secondary/primary classes in all five languages", () => {
    vi.stubGlobal("document", { body: {} });
    for (const language of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]) {
      const html = renderToStaticMarkup(createElement(ImageFailureDialog, { failure: { conversationId: "fixture", messageId: "fixture", stage: "generation", message: "<fixture-only>" }, language, onClose: vi.fn(), onOpen: vi.fn() }));
      const buttons = elements(h.portal as ReactNode).filter(node => node.type === "button");
      expect(buttons).toHaveLength(2);
      expect(buttons[0].props.className).toBe("btn btn-secondary");
      expect(buttons[1].props.className?.split(/\s+/)).toEqual(expect.arrayContaining(["btn", "btn-primary", "primary"]));
      expect(buttons.every(button => button.props.type === "button")).toBe(true);
      expect(html).toContain('role="alertdialog"'); expect(html).toContain("&lt;fixture-only&gt;");
    }
  });

  it("retains image-failure callbacks and Escape handling without performing a generation", () => {
    vi.stubGlobal("document", { body: {} });
    const onClose = vi.fn(), onOpen = vi.fn();
    renderToStaticMarkup(createElement(ImageFailureDialog, { failure: { conversationId: "fixture", messageId: "fixture", stage: "proposal", message: "fixture" }, language: "en-US", onClose, onOpen }));
    const nodes = elements(h.portal as ReactNode), buttons = nodes.filter(node => node.type === "button");
    expect(onClose).not.toHaveBeenCalled(); expect(onOpen).not.toHaveBeenCalled();
    buttons[0].props.onClick(); buttons[1].props.onClick();
    expect(onClose).toHaveBeenCalledOnce(); expect(onOpen).toHaveBeenCalledOnce();
    const stopPropagation = vi.fn(); nodes.find(node => node.type === "section")!.props.onKeyDown({ key: "Escape", stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce(); expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("styles imperative confirm actions while preserving explicit button types and data-result routing", async () => {
    const fixture = confirmationFixture();
    const result = confirmAction("Fixture message", "Fixture title");
    expect(fixture.cancel().attrs.class).toBe("btn btn-secondary");
    expect(fixture.confirm().attrs.class.split(/\s+/)).toEqual(expect.arrayContaining(["btn", "btn-primary", "primary"]));
    expect(fixture.cancel().attrs.type).toBe("button"); expect(fixture.confirm().attrs.type).toBe("button");
    expect(fixture.document.activeElement).toBe(fixture.cancel());
    fixture.handlers.get("click")!({ target: fixture.confirm(), stopPropagation: vi.fn() });
    await expect(result).resolves.toBe(true);
    expect(h.release).toHaveBeenCalledOnce(); expect(h.unsubscribe).toHaveBeenCalledOnce(); expect(fixture.backdrop.remove).toHaveBeenCalledOnce();
  });

  it("keeps imperative cancellation, focus cycling, and idempotent cleanup", async () => {
    const fixture = confirmationFixture(), result = confirmAction("Fixture message");
    const preventDefault = vi.fn(), stopPropagation = vi.fn();
    fixture.handlers.get("keydown")!({ key: "Tab", shiftKey: false, preventDefault, stopPropagation });
    expect(fixture.document.activeElement).toBe(fixture.confirm()); expect(preventDefault).toHaveBeenCalledOnce();
    fixture.handlers.get("keydown")!({ key: "Escape", preventDefault, stopPropagation });
    fixture.handlers.get("click")!({ target: fixture.confirm(), stopPropagation });
    await expect(result).resolves.toBe(false);
    expect(h.release).toHaveBeenCalledOnce(); expect(h.unsubscribe).toHaveBeenCalledOnce();
  });

  it("never opens a modal for an already-aborted confirmation", async () => {
    const fixture = confirmationFixture(), controller = new AbortController(); controller.abort();
    await expect(confirmAction("Fixture message", "Fixture title", undefined, controller.signal)).resolves.toBe(false);
    expect(fixture.document.body.appendChild).not.toHaveBeenCalled(); expect(h.release).not.toHaveBeenCalled();
  });

  it("puts the actual ArtistLab prompt-copy action on shared ghost styling, leaving clipboard behavior intact", () => {
    const source = readFileSync("src/ArtistLab.tsx", "utf8");
    const ast = ts.createSourceFile("ArtistLab.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const copies: ts.JsxOpeningElement[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "button" && node.parent.getText(ast).includes("navigator.clipboard.writeText(result.prompt)")) copies.push(node);
      ts.forEachChild(node, visit);
    };
    visit(ast); expect(copies).toHaveLength(1);
    const attributes = new Map(copies[0].attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(ast), attribute.initializer?.getText(ast)]));
    expect(attributes.get("className")).toBe('"btn btn-ghost"'); expect(attributes.get("type")).toBe('"button"');
    expect(attributes.get("onClick")).toContain("navigator.clipboard.writeText(result.prompt)"); expect(attributes.get("onClick")).toContain("setMessage(text.copied)");
  });
});
