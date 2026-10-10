import { expect, it } from "vitest";
import { isInsideInpaintSurface } from "./inpaint-pointer";
const canvas = { left: 20, top: 30, right: 120, bottom: 230 };
const stage = { left: 0, top: 0, right: 200, bottom: 300 };
it("includes visible left/top, excludes right/bottom", () => {
  expect(isInsideInpaintSurface(20, 30, canvas, stage)).toBe(true);
  expect(isInsideInpaintSurface(119.9, 229.9, canvas, stage)).toBe(true);
  expect(isInsideInpaintSurface(120, 100, canvas, stage)).toBe(false);
  expect(isInsideInpaintSurface(100, 230, canvas, stage)).toBe(false);
});
it("hides outside each edge", () => {
  for (const [x,y] of [[19,100],[121,100],[80,29],[80,231]]) expect(isInsideInpaintSurface(x,y,canvas,stage)).toBe(false);
});
it("uses clipped intersection after pan and zoom", () => {
  const zoomed={left:-150,top:-150,right:400,bottom:500};
  expect(isInsideInpaintSurface(-1,50,zoomed,stage)).toBe(false);
  expect(isInsideInpaintSurface(50,50,zoomed,stage)).toBe(true);
  expect(isInsideInpaintSurface(201,50,zoomed,stage)).toBe(false);
});
it("rejects missing surface and nonfinite coordinates", () => {
  expect(isInsideInpaintSurface(50,50,undefined,stage)).toBe(false);
  expect(isInsideInpaintSurface(50,50,canvas,undefined)).toBe(false);
  expect(isInsideInpaintSurface(NaN,50,canvas,stage)).toBe(false);
  expect(isInsideInpaintSurface(50,Infinity,canvas,stage)).toBe(false);
});
it("rejects empty/disjoint surface", () => {
  expect(isInsideInpaintSurface(50,50,canvas,{left:150,top:0,right:200,bottom:300})).toBe(false);
});
