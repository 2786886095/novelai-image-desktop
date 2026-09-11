import { expect, it } from "vitest";
import { buildImageOrder, moveImageOrder } from "./image-order";
it("uses one-based file-name positions and moves without losing or duplicating files", () => {
 const order = buildImageOrder(["1.png", "2.png", "10.png"]);
 expect([...order]).toEqual([[1,"1.png"],[2,"2.png"],[3,"10.png"]]);
 const moved = moveImageOrder(order, 3, 1);
 expect([...moved]).toEqual([[1,"10.png"],[2,"1.png"],[3,"2.png"]]);
 expect([...moveImageOrder(moved,1,3)]).toEqual([...order]);
 expect([...order.values()]).toEqual(["1.png","2.png","10.png"]);
 expect(moveImageOrder(order,0,1)).toBe(order);
});
