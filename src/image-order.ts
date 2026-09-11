/** One-based positions map to file names (relative paths distinguish duplicate names). */
export type ImageOrder = Map<number, string>;
export function buildImageOrder(names: string[]): ImageOrder {
  return new Map(names.map((name, index) => [index + 1, name]));
}
export function moveImageOrder(order: ImageOrder, from: number, to: number): ImageOrder {
  const names = Array.from(order.values());
  if (from < 1 || to < 1 || from > names.length || to > names.length) return order;
  const [name] = names.splice(from - 1, 1);
  names.splice(to - 1, 0, name);
  return buildImageOrder(names);
}
