import { describe, expect, it } from 'vitest';
import { badgeWidth, clearOf, clearOfAll, fitLabel } from '../src/layout';

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

describe('clearOfAll', () => {
  const now = { x: 19, w: 34 };
  const power = { x: 60, w: 76 };

  it('leaves a badge alone when nothing is in the way', () => {
    expect(clearOfAll(200, 70, [now, power], 0, 300)).toBe(200);
    expect(clearOfAll(200, 70, [], 0, 300)).toBe(200);
  });

  it('clears two badges at once, where moving clear of one at a time would land on the other', () => {
    // just right of NOW (57) is inside POWER DOWN; the nearest free spot is past POWER DOWN
    expect(clearOfAll(40, 70, [now, power], 0, 300)).toBe(140);
  });

  it('goes to the left of the badges when the right side has no room', () => {
    expect(clearOfAll(210, 70, [{ x: 200, w: 34 }], 0, 230)).toBe(126);
  });

  it('falls back to the wanted position, clamped, when the row is too crowded', () => {
    expect(clearOfAll(20, 70, [{ x: 0, w: 90 }], 0, 80)).toBe(20);
  });
});

describe('fitLabel', () => {
  const labels = ['▼ Discharge · 16%', '▼ 16%', '▼'];

  it('picks the longest label that fits', () => {
    expect(fitLabel(200, labels)).toBe('▼ Discharge · 16%');
    expect(fitLabel(60, labels)).toBe('▼ 16%');
    expect(fitLabel(20, labels)).toBe('▼');
  });

  it('gives no label when nothing fits', () => {
    expect(fitLabel(5, labels)).toBe('');
    expect(fitLabel(100, [])).toBe('');
  });
});
