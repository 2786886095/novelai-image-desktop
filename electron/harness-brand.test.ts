import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

describe("Studio Harness brand plugin", () => {
  it("fills all three official extension slots without rewriting upstream modules", () => {
    const client = readFileSync(new URL("../harness/plugins/studio-brand/lib/client.js", import.meta.url), "utf8");
    const records: Record<string, (props: object) => any> = {};
    let id = "";
    vm.runInNewContext(client, {
      window: { __ModuleLoader__: { load: (module: any) => {
        id = module.id;
        const jsx = (tag: string, props: object) => ({ tag, props });
        const plugin = module.factory((name: string) => {
          expect(name).toBe("react/jsx-runtime");
          return { jsx, jsxs: jsx };
        });
        expect([...plugin.inject]).toEqual(["slots"]);
        plugin.apply({ slots: {
          inject: (_name: string, callback: () => void) => callback(),
          register: ({ name }: { name: string }, component: any) => { records[name] = component; },
        }, effect: () => {} });
      } } },
    });
    expect(id).toBe("@langbai/dsh-studio-brand");
    expect(Object.keys(records).sort()).toEqual([
      "conversation.hero.brand.mark", "sidebar.brand.mark", "sidebar.brand.name",
    ]);
    const mark = records["sidebar.brand.mark"]({ size: 42 });
    expect(mark.props.style.objectFit).toBe("contain");
    expect(mark.props.style.width).toBe(42);
    const png = Buffer.from(mark.props.src.split(",")[1], "base64");
    const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
    expect(hash(png)).toBe(hash(readFileSync(new URL("../public/icon.png", import.meta.url))));
    const name = records["sidebar.brand.name"]({});
    expect(name.props.children.map((child: any) => child.props.children)).toEqual(["NovelAI", "STUDIO"]);
    expect(name.props.style.whiteSpace).toBe("nowrap");
    const badge = name.props.children[1];
    expect(badge.props.style.border).toBe("none");
    expect(badge.props.style.background).toContain("--dsw-alias-label-primary");
    expect(badge.props.style.color).toContain("--dsw-alias-bg-module-platform");
    expect(badge.props.style.height).toBe(14);
    expect(records["conversation.hero.brand.mark"]({}).props.alt).toBe("NovelAI Studio");
  });

  it("declares a separate plugin package, preserving upstream dependency identifiers", () => {
    const metadata = JSON.parse(readFileSync(new URL("../harness/plugins/studio-brand/package.json", import.meta.url), "utf8"));
    expect(metadata.name).toBe("@langbai/dsh-studio-brand");
    expect(metadata.dsh.client.inject).toContain("@deepseek-ai/dsh-client-ui-conversation");
    expect(metadata.exports["./client"]).toBe("./lib/client.js");
  });
});
