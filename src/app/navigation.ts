export const ACTIVE_TABS = [
  "generate",
  "inpaint",
  "upscale",
  "postprocess",
  "inspect",
  "convert",
  "metadata",
  "tools",
  "referencePresets",
  "onlineGallery",
  "records",
] as const;

export type ActiveTab = (typeof ACTIVE_TABS)[number];

const ACTIVE_TAB_SET = new Set<string>(ACTIVE_TABS);

export function isActiveTab(value: unknown): value is ActiveTab {
  return typeof value === "string" && ACTIVE_TAB_SET.has(value);
}

export const WIDE_WORKSPACE_TABS = new Set<ActiveTab>([
  "metadata",
  "tools",
  "referencePresets",
  "onlineGallery",
  "records",
]);

