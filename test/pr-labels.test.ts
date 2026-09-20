import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script with no type declarations
import { labelChanges, labelsForTitle } from '../scripts/pr-labels.mjs';

describe('labelsForTitle', () => {
  it('maps each type to its release-notes label', () => {
    expect(labelsForTitle('feat(predbat): fill the chart')).toEqual(['enhancement']);
    expect(labelsForTitle('fix(chart): keep labels clear')).toEqual(['bug']);
    expect(labelsForTitle('perf: shrink the bundle')).toEqual(['bug']);
    expect(labelsForTitle('ci(release): group release notes')).toEqual(['maintenance']);
    expect(labelsForTitle('docs: explain the option')).toEqual(['maintenance']);
    expect(labelsForTitle('deps: bump vitest')).toEqual(['dependencies']);
  });

  it('adds breaking for a `!`, with or without a scope', () => {
    expect(labelsForTitle('feat(config)!: rename an option')).toEqual(['enhancement', 'breaking']);
    expect(labelsForTitle('fix!: change the default')).toEqual(['bug', 'breaking']);
  });

  it('gives null for titles that are not in the convention', () => {
    expect(labelsForTitle('Fill the chart past the published rates')).toBeNull();
    expect(labelsForTitle('feature(chart): unknown type')).toBeNull();
    expect(labelsForTitle('feat(chart):no space')).toBeNull();
    expect(labelsForTitle('feat: ')).toBeNull();
    expect(labelsForTitle('constructor: nope')).toBeNull();
    expect(labelsForTitle('')).toBeNull();
  });
});

describe('labelChanges', () => {
  it('adds the missing label and leaves unrelated ones alone', () => {
    expect(labelChanges('fix(chart): x', ['good first issue'])).toEqual({ add: ['bug'], remove: [] });
  });

  it('swaps a stale managed label when the title changes', () => {
    expect(labelChanges('feat(chart): x', ['bug', 'wontfix'])).toEqual({ add: ['enhancement'], remove: ['bug'] });
    expect(labelChanges('fix(chart): x', ['bug', 'breaking'])).toEqual({ add: [], remove: ['breaking'] });
  });

  it('does nothing when the labels already match, or the title does not parse', () => {
    expect(labelChanges('fix(chart): x', ['bug'])).toEqual({ add: [], remove: [] });
    expect(labelChanges('Fix the chart', ['bug', 'enhancement'])).toEqual({ add: [], remove: [] });
  });
});
