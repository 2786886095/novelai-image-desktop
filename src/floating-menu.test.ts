import { describe, expect, it } from "vitest";
import { isScrollInsideFloatingMenu } from "./floating-menu";

describe("isScrollInsideFloatingMenu", () => {
  it("keeps a floating menu open when its own list is scrolled", () => {
    const inside = {} as EventTarget;
    const menu = { contains: (target: Node) => target === (inside as unknown as Node) };
    expect(isScrollInsideFloatingMenu(menu, inside)).toBe(true);
  });

  it("allows an external scroll to dismiss the floating menu", () => {
    const outside = {} as EventTarget;
    const menu = { contains: () => false };
    expect(isScrollInsideFloatingMenu(menu, outside)).toBe(false);
  });
});
