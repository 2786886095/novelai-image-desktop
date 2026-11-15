import { describe, expect, it } from "vitest";
import { ACTIVE_TABS } from "../app/navigation";
import { normalizeTabOrder } from "../app/tab-order";
import { groupedTabOrder, moveTabWithinGroup, NAV_GROUPS, rankCommands, SETTINGS_SECTIONS, TOOL_ENTRIES, type CommandItem } from "./nav-model";

describe("navigation rail model", () => {
  it("places every destination in exactly one group (no feature dropped)", () => {
    const grouped = NAV_GROUPS.flatMap((group) => group.tabs);
    expect([...grouped].sort()).toEqual([...ACTIVE_TABS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("keeps the user's saved order inside each group", () => {
    const saved = normalizeTabOrder(["postprocess", "favorites", "generate", "works"]);
    const groups = groupedTabOrder(saved);
    expect(groups.find((g) => g.id === "create")?.tabs).toEqual(["postprocess", "generate", "inpaint"]);
    expect(groups.find((g) => g.id === "library")?.tabs.slice(0, 2)).toEqual(["favorites", "works"]);
    expect(groups.flatMap((g) => g.tabs)).toHaveLength(ACTIVE_TABS.length);
  });

  it("moves a destination only within its own group", () => {
    const order = normalizeTabOrder(null);
    const next = moveTabWithinGroup(order, "inpaint", -1);
    expect(groupedTabOrder(next).find((g) => g.id === "create")?.tabs).toEqual(["inpaint", "generate", "postprocess"]);
    // At the group edge nothing crosses into the neighbouring group.
    const edge = moveTabWithinGroup(order, "generate", -1);
    expect(groupedTabOrder(edge)[0].tabs[0]).toBe("generate");
    expect(normalizeTabOrder(edge)).toHaveLength(ACTIVE_TABS.length);
  });

  it("lists every tools-hub entry and settings section", () => {
    expect(TOOL_ENTRIES.map((t) => t.id).sort()).toEqual(
      ["artistLab", "artistLookup", "artistStringDraw", "comfyuiLocal", "comic", "japaneseComic", "promptCodex", "redraw", "v5ArtistRepair"].sort(),
    );
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      "api", "storage", "backup", "ai-reverse", "convert-api", "templates", "prompt", "language", "sound", "appearance", "performance", "mcp", "about",
    ]);
  });

  it("ranks palette commands by prefix, substring and keywords", () => {
    const noop = () => undefined;
    const items: CommandItem[] = [
      { id: "a", label: "批量图生图", hint: "工具", group: "工具", icon: "draw", keywords: "redraw batch", run: noop },
      { id: "b", label: "生成", hint: "文生图 / 图生图", group: "页面", icon: "sparkles", keywords: "generate", run: noop },
      { id: "c", label: "备份与恢复", hint: "设置", group: "设置", icon: "cloudSync", keywords: "backup settings", run: noop },
    ];
    expect(rankCommands(items, "生成")[0].id).toBe("b");
    expect(rankCommands(items, "backup")[0].id).toBe("c");
    expect(rankCommands(items, "batch").map((i) => i.id)).toEqual(["a"]);
    expect(rankCommands(items, "")).toHaveLength(3);
    expect(rankCommands(items, "zzz")).toHaveLength(0);
  });
});
