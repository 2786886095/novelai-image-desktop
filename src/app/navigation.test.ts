import { describe, expect, it } from "vitest";
import { TAB_ITEMS } from "../prompt-data";
import { ACTIVE_TABS, isActiveTab, WIDE_WORKSPACE_TABS } from "./navigation";

describe("main navigation", () => {
  it("keeps the rendered tab order aligned with the active-tab contract", () => {
    expect(TAB_ITEMS.map((item) => item.value)).toEqual([...ACTIVE_TABS]);
    expect(ACTIVE_TABS.indexOf("onlineGallery")).toBe(
      ACTIVE_TABS.indexOf("referencePresets") + 1,
    );
    expect(ACTIVE_TABS.indexOf("agent")).toBe(
      ACTIVE_TABS.indexOf("onlineGallery") + 1,
    );
    expect(ACTIVE_TABS.indexOf("records")).toBe(
      ACTIVE_TABS.indexOf("agent") + 1,
    );
  });

  it("validates top-level routes and treats the gallery as a wide workspace", () => {
    expect(isActiveTab("onlineGallery")).toBe(true);
    expect(isActiveTab("upscale")).toBe(false);
    expect(isActiveTab("aitag")).toBe(false);
    expect(WIDE_WORKSPACE_TABS.has("onlineGallery")).toBe(true);
    expect(WIDE_WORKSPACE_TABS.has("agent")).toBe(true);
  });
});
