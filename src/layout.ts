/** Width of a badge with `text` (10px semibold label plus padding). */
export const badgeWidth = (text: string): number => text.length * 6.4 + 12;

export interface Span {
  x: number;
  w: number;
}

const GAP = 4;

/**
 * Left edge for a badge of width `w` that wants to sit at `x`, kept inside [min, max] and clear of `avoid`.
 * Prefers moving right of `avoid`, and goes to its left when there is no room on the right.
 */
export const clearOf = (x: number, w: number, avoid: Span | undefined, min: number, max: number): number => {
  const fit = (v: number) => Math.max(min, Math.min(v, max));
  const left = fit(x);
  if (!avoid || left >= avoid.x + avoid.w + GAP || left + w + GAP <= avoid.x) return left;
  const right = avoid.x + avoid.w + GAP;
  return right <= max ? right : fit(avoid.x - GAP - w);
};
