import { describe, expect, it } from 'vitest';
import { badgeWidth, clearOf } from '../src/layout';

describe('badgeWidth', () => {
  it('grows with the label length', () => {
    expect(badgeWidth('NOW')).toBeCloseTo(31.2);
    expect(badgeWidth('POWER DOWN')).toBeGreaterThan(badgeWidth('NOW'));
  });
});

describe('clearOf', () => {
  const now = { x: 19, w: 34 }; // NOW badge near the left edge

  it('leaves a badge alone when nothing is in the way', () => {
    expect(clearOf(100, 70, now, 0, 300)).toBe(100);
    expect(clearOf(100, 70, undefined, 0, 300)).toBe(100);
  });

  it('moves a badge that overlaps the other one to its right', () => {
    // the regression: an already-active session's badge starts at about x=40, under the NOW badge
    expect(clearOf(40, 76, now, 0, 300)).toBe(57);
  });

  it('goes to the left of the other badge when there is no room on the right', () => {
    expect(clearOf(250, 60, { x: 240, w: 34 }, 0, 260)).toBe(176);
  });

  it('keeps the badge inside the bounds', () => {
    expect(clearOf(-20, 50, undefined, 0, 300)).toBe(0);
    expect(clearOf(400, 50, undefined, 0, 300)).toBe(300);
  });
});
