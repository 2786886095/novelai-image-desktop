import { readFileSync } from "node:fs";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ input: { value: "", click: vi.fn() }, changedNames: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useId: () => "fixture-file-picker", useRef: () => ({ current: h.input }), useState: () => ["", h.changedNames] }));
vi.mock("./store", () => ({ useAppStore: (pick: any) => pick({ settings: { language: "en-US" } }) }));
import { FilePicker } from "./components/FilePicker";

type Consumer = { tag: string; attributes: Map<string, ts.JsxAttribute>; source: ts.SourceFile; callback: string };
function consumers(file: string): Consumer[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), result: Consumer[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(source), attributes = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(source), attribute]));
      const change = attributes.get("onChange")?.initializer;
      if ((tag === "FilePicker" || (tag === "input" && attributes.get("type")?.initializer?.getText(source) === '"file"')) && change && ts.isJsxExpression(change) && change.expression) {
        const callback = change.expression.getText(source);
        if (/importVibeFile|handleVibeFile|handlePreciseFile|handleFile\(f\)|void add\(e.target.files\)|importProject\(e.target.files|importPromptsFile\(e.target.files/.test(callback)) result.push({ tag, attributes, source, callback });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source); return result;
}
const pages = () => [...consumers("src/App.tsx"), ...consumers("src/ComicGenerator.tsx")];
const initializer = (consumer: Consumer, name: string) => consumer.attributes.get(name)?.initializer?.getText(consumer.source);
const pickerParts = (props: Parameters<typeof FilePicker>[0]) => {
  const element = FilePicker(props), children = element.props.children as ReactElement<Record<string, any>>[];
  return { element, input: children[0], trigger: children[1] };
};
beforeEach(() => { vi.clearAllMocks(); h.input.value = "previous-file"; });

describe("desktop page file-picking consumers", () => {
  it("replaces all nine bounded label-button file actions with real FilePicker buttons", () => {
    const targets = pages(); expect(targets).toHaveLength(9);
    expect(consumers("src/App.tsx")).toHaveLength(4); expect(consumers("src/ComicGenerator.tsx")).toHaveLength(5);
    for (const target of targets) {
      expect(target.tag, target.callback).toBe("FilePicker");
      expect(target.attributes.has("compact")).toBe(true); expect(target.attributes.has("buttonLabel")).toBe(true);
      expect(target.attributes.has("type")).toBe(false); expect(target.attributes.has("hidden")).toBe(false);
    }
  });

  it("preserves exact file filters, multi-select, and capability-disabled conditions", () => {
    const app = consumers("src/App.tsx"), comic = consumers("src/ComicGenerator.tsx");
    expect(app.map(target => initializer(target, "accept"))).toEqual(['".json,.naiv4vibe,.naiv4vibebundle"', '"image/png,image/jpeg,image/webp"', '"image/png,image/jpeg,image/webp"', '"image/png,image/jpeg,image/webp"']);
    expect(initializer(app[1], "disabled")).toBe("{!vibeSupported}"); expect(initializer(app[2], "disabled")).toBe("{!preciseSupported}");
    expect(comic.map(target => initializer(target, "accept"))).toEqual(['"image/*"', '"image/*"', '".json,application/json"', '".json,application/json"', '".txt,text/plain"']);
    expect(comic.map(target => target.attributes.has("multiple"))).toEqual([true, true, false, false, false]);
  });

  it("runs each actual consumer callback once with the selected file(s), preserving reset-for-reselection", () => {
    const names = ["add", "importProject", "importPromptsFile", "importVibeFile", "handleVibeFile", "handlePreciseFile", "handleFile"];
    for (const target of pages()) {
      const calls = Object.fromEntries(names.map(name => [name, vi.fn()])), file = { name: "fixture.png" }, files = [file], event = { target: { files, value: "fixture-selection" } };
      const callback = new Function(...names, `return (${target.callback})`)(...names.map(name => calls[name]));
      callback(event);
      const invoked = names.filter(name => calls[name].mock.calls.length);
      expect(invoked).toHaveLength(1); expect(calls[invoked[0]]).toHaveBeenCalledOnce();
      if (invoked[0] === "add") expect(calls.add).toHaveBeenCalledWith(files);
      else if (invoked[0] === "handleVibeFile") expect(calls.handleVibeFile).toHaveBeenCalledWith(file, 1, 1);
      else expect(calls[invoked[0]]).toHaveBeenCalledWith(file);
      expect(event.target.value).toBe("");
    }
  });

  it("renders a native type=button keyboard target and disabled state on both trigger and file input", () => {
    const html = renderToStaticMarkup(<FilePicker compact buttonLabel="Fixture import" multiple accept="image/*" disabled />);
    expect(html.match(/<button\b/g)).toHaveLength(1); expect(html).toMatch(/<button\b[^>]*type="button"/);
    expect(html).toContain("Fixture import"); expect(html.match(/disabled=""/g)).toHaveLength(2); expect(html).toContain('multiple=""');
    expect(html).toMatch(/<input\b[^>]*type="file"[^>]*hidden=""/); expect(html).not.toContain("file-picker-name");
    // Native button Enter/Space activation is not replaced with a label or a custom key handler.
    expect(pickerParts({ compact: true }).trigger.props.onKeyDown).toBeUndefined();
  });

  it("resets the hidden native picker before each activation and forwards the original change event", () => {
    const changed = vi.fn(), prevented = vi.fn(), { input, trigger } = pickerParts({ compact: true, accept: ".txt", onChange: changed });
    trigger.props.onClick({ preventDefault: prevented }); expect(h.input.value).toBe(""); expect(h.input.click).toHaveBeenCalledOnce();
    h.input.value = "same-file"; trigger.props.onClick({ preventDefault: prevented }); expect(h.input.value).toBe(""); expect(h.input.click).toHaveBeenCalledTimes(2);
    const event = { target: { files: [{ name: "fixture.txt" }], value: "fixture" } }; input.props.onChange(event);
    expect(changed).toHaveBeenCalledExactlyOnceWith(event); expect(h.changedNames).toHaveBeenCalledWith("fixture.txt"); expect(input.props.accept).toBe(".txt");
  });

  it("retains an explicitly supplied input click propagation guard without moving it to a different event", () => {
    const stopPropagation = vi.fn(), onClick = vi.fn(event => event.stopPropagation()), { input } = pickerParts({ compact: true, onClick });
    input.props.onClick({ stopPropagation }); expect(onClick).toHaveBeenCalledOnce(); expect(stopPropagation).toHaveBeenCalledOnce();
  });
});
