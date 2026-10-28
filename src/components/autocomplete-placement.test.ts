import { describe, expect, it } from "vitest";
import { AUTOCOMPLETE_LIST_MAX_HEIGHT, fitAutocompleteList, visibleVerticalRange } from "./autocomplete-placement";

describe("tag suggestion list placement", () => {
  // The generate tab's left panel at 1440x960: its scroll area spans 249..717.
  const panel = { top: 249, bottom: 717 };

  it("opens below the caret line when the whole list fits there", () => {
    expect(fitAutocompleteList({ top: 300, bottom: 318 }, panel, 101, 8)).toEqual({ above: false });
    // Exactly enough room: 717 - 4 - (604 + 8) = 101.
    expect(fitAutocompleteList({ top: 586, bottom: 604 }, panel, 101, 8)).toEqual({ above: false });
  });

  it("opens above the caret line when only the space above shows the whole list", () => {
    // Prompt box at the bottom of the panel: 37px of room below the line, 389px above it.
    expect(fitAutocompleteList({ top: 650, bottom: 668 }, panel, 101, 8)).toEqual({ above: true });
    expect(fitAutocompleteList({ top: 587, bottom: 605 }, panel, 101, 8)).toEqual({ above: true });
  });

  it("takes the side with more room and caps the height when neither side fits", () => {
    const short = { top: 100, bottom: 400 };
    // Below: 400 - 4 - (218 + 8) = 170; above: 200 - 8 - (100 + 4) = 88.
    expect(fitAutocompleteList({ top: 200, bottom: 218 }, short, 240, 8)).toEqual({ above: false, maxHeight: 170 });
    // Above: 300 - 8 - 104 = 188; below: 396 - 326 = 70.
    expect(fitAutocompleteList({ top: 300, bottom: 318 }, short, 240, 8)).toEqual({ above: true, maxHeight: 188 });
    expect(fitAutocompleteList({ top: 300.5, bottom: 318.5 }, short, 240, 8).maxHeight).toBe(188);
    // No room at all never gives a negative height.
    expect(fitAutocompleteList({ top: 0, bottom: 18 }, { top: 0, bottom: 20 }, 240, 8)).toEqual({ above: false, maxHeight: 0 });
  });

  it("keeps the 260px height limit", () => {
    expect(AUTOCOMPLETE_LIST_MAX_HEIGHT).toBe(260);
    // A 400px list is only 260px tall, which fits below here.
    expect(fitAutocompleteList({ top: 100, bottom: 118 }, { top: 0, bottom: 400 }, 400, 8)).toEqual({ above: false });
    // Above, the 260px list fits in 488px of room without a cap.
    expect(fitAutocompleteList({ top: 500, bottom: 518 }, { top: 0, bottom: 540 }, 400, 8)).toEqual({ above: true });
  });
});

describe("visible range of the suggestion list", () => {
  type Fake = { parentElement: Fake | null; overflowY: string; position: string; top: number; clientTop: number; clientHeight: number };
  const body: Fake = { parentElement: null, overflowY: "hidden", position: "static", top: 0, clientTop: 0, clientHeight: 10 };
  const box = (parentElement: Fake | null, overflowY: string, top: number, clientHeight: number, extra: Partial<Fake> = {}): Fake =>
    ({ parentElement, overflowY, position: "static", top, clientTop: 0, clientHeight, ...extra });
  const listIn = (parentElement: Fake) => ({
    parentElement,
    ownerDocument: {
      body,
      documentElement: {},
      defaultView: { innerHeight: 960, getComputedStyle: (element: Fake) => ({ overflowY: element.overflowY, position: element.position }) },
    },
  }) as unknown as Element;
  const withRect = (element: Fake): Fake => Object.assign(element, { getBoundingClientRect: () => ({ top: element.top }) });

  it("is the window cut down by every ancestor that clips its overflow", () => {
    const shell = withRect(box(body, "clip", 0, 960));
    const sidePanel = withRect(box(shell, "hidden", 142, 774, { clientTop: 1 }));
    const scroll = withRect(box(sidePanel, "auto", 249, 468));
    const editor = withRect(box(scroll, "visible", 634, 254));
    const wrap = withRect(box(editor, "visible", 635, 240));
    expect(visibleVerticalRange(listIn(wrap))).toEqual({ top: 249, bottom: 717 });
    // Without a clipping ancestor it is the window; the body is not a clip.
    expect(visibleVerticalRange(listIn(withRect(box(body, "visible", 600, 100))))).toEqual({ top: 0, bottom: 960 });
  });

  it("stops at a fixed dialog, whose own ancestors do not clip it", () => {
    const page = withRect(box(body, "hidden", 500, 100));
    const dialog = withRect(box(page, "visible", 80, 800, { position: "fixed" }));
    const dialogBody = withRect(box(dialog, "auto", 140, 600, { clientTop: 2 }));
    const wrap = withRect(box(dialogBody, "visible", 300, 140));
    expect(visibleVerticalRange(listIn(wrap))).toEqual({ top: 142, bottom: 742 });
  });
});
