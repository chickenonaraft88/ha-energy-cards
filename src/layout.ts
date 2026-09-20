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

/**
 * Left edge for a badge of width `w` that wants to sit at `x`, clear of every span in `avoid` at once and inside
 * [min, max]. Takes the nearest position that fits (just past either side of any span), and falls back to `x`
 * clamped when the row is too crowded for any.
 */
export const clearOfAll = (x: number, w: number, avoid: Span[], min: number, max: number): number => {
  const fit = (v: number) => Math.max(min, Math.min(v, max));
  const free = (left: number) => avoid.every((a) => left >= a.x + a.w + GAP || left + w + GAP <= a.x);
  const candidates = [x, ...avoid.flatMap((a) => [a.x + a.w + GAP, a.x - GAP - w])]
    .map(fit)
    .filter(free)
    .sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
  return candidates[0] ?? fit(x);
};

/** Width of a 10px semibold label plus padding, for labels drawn inside a bar. */
export const labelFitWidth = (text: string): number => text.length * 5.8 + 12;

/** First candidate (longest first) that fits in `width`, or '' when none does. */
export const fitLabel = (width: number, candidates: string[]): string =>
  candidates.find((t) => labelFitWidth(t) <= width) ?? '';
