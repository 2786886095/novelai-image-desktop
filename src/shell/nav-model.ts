import type { ActiveTab } from "../app/navigation";
import type { IconName } from "../components/icons";

/** Fixed functional groups for the left navigation rail. Order inside a group
 *  follows the user's saved destination order (the former "排列顶栏"). */
export type NavGroupId = "create" | "prompt" | "library" | "automation";

export const NAV_GROUPS: ReadonlyArray<{ id: NavGroupId; tabs: readonly ActiveTab[] }> = [
  { id: "create", tabs: ["generate", "inpaint", "postprocess"] },
  { id: "prompt", tabs: ["inspect", "convert", "metadata"] },
  { id: "library", tabs: ["works", "favorites", "styles", "referencePresets", "onlineGallery"] },
  { id: "automation", tabs: ["tools", "agent", "records"] },
];

export function groupOfTab(tab: ActiveTab): NavGroupId {
  return NAV_GROUPS.find((group) => group.tabs.includes(tab))?.id ?? "automation";
}

/** Split the saved global order into groups, never dropping a destination. */
export function groupedTabOrder(order: readonly ActiveTab[]): Array<{ id: NavGroupId; tabs: ActiveTab[] }> {
  const seen = new Set<ActiveTab>();
  const ordered = [...order, ...NAV_GROUPS.flatMap((group) => group.tabs)].filter((tab) => {
    if (seen.has(tab)) return false;
    seen.add(tab);
    return true;
  });
  return NAV_GROUPS.map((group) => ({ id: group.id, tabs: ordered.filter((tab) => group.tabs.includes(tab)) }));
}

/** Move a destination one step inside its own group (Alt+↑/↓ in edit mode). */
export function moveTabWithinGroup(order: readonly ActiveTab[], tab: ActiveTab, delta: -1 | 1): ActiveTab[] {
  const groups = groupedTabOrder(order);
  const group = groups.find((item) => item.tabs.includes(tab));
  if (!group) return [...order];
  const index = group.tabs.indexOf(tab);
  const target = index + delta;
  if (target < 0 || target >= group.tabs.length) return groups.flatMap((item) => item.tabs);
  const next = [...group.tabs];
  [next[index], next[target]] = [next[target], next[index]];
  group.tabs = next;
  return groups.flatMap((item) => item.tabs);
}

export type ToolEntryId =
  | "comfyuiLocal" | "japaneseComic" | "comic" | "promptCodex" | "redraw"
  | "artistLookup" | "artistLab" | "v5ArtistRepair" | "artistStringDraw";

export const TOOL_ENTRIES: ReadonlyArray<{ id: ToolEntryId; icon: IconName; windowsOnly?: boolean; comfyOnly?: boolean }> = [
  { id: "redraw", icon: "draw" },
  { id: "japaneseComic", icon: "collections" },
  { id: "comic", icon: "collections" },
  { id: "artistLab", icon: "palette", windowsOnly: true },
  { id: "artistStringDraw", icon: "dice" },
  { id: "v5ArtistRepair", icon: "restore" },
  { id: "artistLookup", icon: "search" },
  { id: "promptCodex", icon: "code" },
  { id: "comfyuiLocal", icon: "code", comfyOnly: true },
];

export const SETTINGS_SECTIONS: ReadonlyArray<{ id: string; icon: IconName }> = [
  { id: "api", icon: "key" },
  { id: "storage", icon: "database" },
  { id: "backup", icon: "cloudSync" },
  { id: "ai-reverse", icon: "smartToy" },
  { id: "convert-api", icon: "translate" },
  { id: "templates", icon: "template" },
  { id: "prompt", icon: "wand" },
  { id: "language", icon: "globe" },
  { id: "sound", icon: "volume" },
  { id: "appearance", icon: "palette" },
  { id: "performance", icon: "speed" },
  { id: "mcp", icon: "plug" },
  { id: "about", icon: "info" },
];

export const OPEN_TOOL_EVENT = "studio:open-tool";

let pendingTool: ToolEntryId | "hub" | null = null;

/** Ask the Tools page to open a tool. The request is also kept until the Tools
 *  page mounts, because that page is lazily created on first visit. */
export function requestOpenTool(tool: ToolEntryId | "hub") {
  pendingTool = tool;
  window.dispatchEvent(new CustomEvent(OPEN_TOOL_EVENT, { detail: tool }));
}

export function takePendingTool() {
  const tool = pendingTool;
  pendingTool = null;
  return tool;
}

export type CommandItem = {
  id: string;
  label: string;
  hint: string;
  group: string;
  icon: IconName;
  keywords: string;
  run: () => void;
};

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Deduplicate subtitle/hint parts against the primary command label so items
 *  like "风格管理" never render "风格管理 风格管理 · 风格管理". */
export function formatCommandHint(label: string, ...parts: Array<string | undefined | null>): string {
  const normLabel = normalize(label);
  const seen = new Set<string>(normLabel ? [normLabel] : []);
  const kept: string[] = [];
  for (const raw of parts) {
    if (!raw) continue;
    for (const segment of raw.split(/\s*·\s*/)) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const key = normalize(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(trimmed);
    }
  }
  return kept.join(" · ");
}

/** Rank commands for the palette: prefix > word > substring > subsequence. */
export function rankCommands(items: readonly CommandItem[], query: string, limit = 40): CommandItem[] {
  const q = normalize(query);
  if (!q) return items.slice(0, limit);
  const scored: Array<{ item: CommandItem; score: number; index: number }> = [];
  items.forEach((item, index) => {
    const label = normalize(item.label);
    const haystack = normalize(`${item.label} ${item.hint} ${item.group} ${item.keywords}`);
    let score = -1;
    if (label.startsWith(q)) score = 400;
    else if (label.includes(q)) score = 300;
    else if (haystack.split(/[\s/·,，、]+/).some((word) => word.startsWith(q))) score = 220;
    else if (haystack.includes(q)) score = 160;
    else {
      let cursor = 0;
      for (const char of q) {
        cursor = haystack.indexOf(char, cursor);
        if (cursor < 0) break;
        cursor += 1;
      }
      if (cursor > 0) score = 60;
    }
    if (score >= 0) scored.push({ item, score: score - Math.min(label.length, 40) / 100, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map((entry) => entry.item);
}
