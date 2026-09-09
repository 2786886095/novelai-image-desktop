import { describe, expect, it, vi } from "vitest";
import { Virtualizer } from "@tanstack/react-virtual";
import { measureMessageRow, measureMountedMessageRows } from "./message-layout";

function fixture(count = 60) {
  const virtualizer = new Virtualizer<HTMLElement, HTMLDivElement>({
    count,
    getScrollElement: () => null,
    getItemKey: (index) => `message-${index}`,
    estimateSize: () => 150,
    scrollToFn: () => {},
    observeElementRect: () => {},
    observeElementOffset: () => {},
    measureElement: measureMessageRow,
  });
  virtualizer.getTotalSize();
  const row = (index: number, height: number) => ({
    dataset: { height: String(height) },
    getBoundingClientRect(this: { dataset: { height: string } }) { return { height: Number(this.dataset.height) }; },
    getAttribute: () => String(index),
    isConnected: true,
  }) as unknown as HTMLDivElement;
  const scroller = (nodes: HTMLDivElement[]) => ({
    querySelectorAll: vi.fn(() => nodes),
  }) as unknown as Pick<HTMLElement, "querySelectorAll">;
  return { virtualizer, row, scroller };
}

describe("Tavern dynamic message row layout", () => {
  it("uses current border-box height and rounds up fractional spacing", () => {
    const { row } = fixture();
    const node = row(0, 400.25);
    expect(measureMessageRow(node)).toBe(401);
    expect(measureMessageRow(node, { borderBoxSize: [{ blockSize: 900.5 }] } as unknown as ResizeObserverEntry)).toBe(901);
  });
  it("reproduces the old global reset shrinking measured replies to estimates", () => {
    const { virtualizer, row } = fixture();
    virtualizer.measureElement(row(0, 1100));
    expect(virtualizer.getTotalSize()).toBe(59 * 150 + 1100);
    virtualizer.measure();
    expect(virtualizer.getTotalSize()).toBe(60 * 150);
  });

  it.each([41, 120, 1000])("retains offscreen heights in a %i-message history", (count) => {
    const { virtualizer, row, scroller } = fixture(count);
    virtualizer.measureElement(row(0, 1100));
    virtualizer.measureElement(row(1, 700));
    const mounted = scroller([row(count - 1, 900)]);
    measureMountedMessageRows(mounted, virtualizer.measureElement);
    expect(virtualizer.itemSizeCache.get("message-0")).toBe(1100);
    expect(virtualizer.itemSizeCache.get("message-1")).toBe(700);
    expect(virtualizer.getTotalSize()).toBe((count - 3) * 150 + 2700);
    expect(mounted.querySelectorAll).toHaveBeenCalledWith(".tavern-virtual-row[data-index]");
  });

  it("remeasures streaming text, loaded media, and collapsed content without drift", () => {
    const { virtualizer, row, scroller } = fixture();
    virtualizer.measureElement(row(0, 1100));
    const node = row(1, 400);
    for (const height of [400, 1400, 1700, 200, 200]) {
      node.dataset.height = String(height);
      measureMountedMessageRows(scroller([node]), virtualizer.measureElement);
      expect(virtualizer.getTotalSize()).toBe(58 * 150 + 1100 + height);
    }
  });

  it("does not reset measurements when no row is mounted", () => {
    const { virtualizer, row, scroller } = fixture();
    virtualizer.measureElement(row(0, 1100));
    measureMountedMessageRows(scroller([]), virtualizer.measureElement);
    expect(virtualizer.getTotalSize()).toBe(59 * 150 + 1100);
  });
});
