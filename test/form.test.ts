import { describe, expect, it } from 'vitest';
import { buildConfigForm, computeLabel } from '../src/form';

type Entry = { name?: string; title?: string; schema?: Entry[] };

const flatten = (schema: Entry[]): Entry[] => schema.flatMap((s) => (s.schema ? [s, ...flatten(s.schema)] : [s]));

describe('config form', () => {
  it('returns a non-empty label for every schema entry, including nameless groups', () => {
    // HA calls schema.name.split() when the label is falsy, which crashed the whole editor.
    const { schema } = buildConfigForm();
    for (const entry of flatten(schema as Entry[])) {
      expect(computeLabel(entry), JSON.stringify(entry)).toBeTruthy();
    }
  });

  it('uses the group title for the expandable section', () => {
    expect(computeLabel({ title: 'Advanced' })).toBe('Advanced');
  });

  it('uses friendly labels for known fields', () => {
    expect(computeLabel({ name: 'height' })).toBe('Chart height (px)');
  });
});
