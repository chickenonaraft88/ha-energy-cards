import { describe, expect, it } from 'vitest';
import { buildConfigForm, computeLabel } from '../src/form';

type Entry = { name?: string; title?: string; schema?: Entry[]; selector?: unknown };

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

  it('limits the devices entity picker to power sensors', () => {
    const { schema } = buildConfigForm();
    const devices = flatten(schema as Entry[]).find((s) => s.name === 'devices') as {
      selector?: { entity?: { domain?: string; device_class?: string } };
    };
    expect(devices.selector?.entity?.domain).toBe('sensor');
    expect(devices.selector?.entity?.device_class).toBe('power');
  });

  it('edits run_after as a list of device pickers, with an optional wait', () => {
    const { schema } = buildConfigForm();
    const runAfter = flatten(schema as Entry[]).find((s) => s.name === 'run_after') as {
      selector: {
        object: {
          multiple?: boolean;
          fields: Record<string, { required?: boolean; selector: { entity?: object; number?: object } }>;
        };
      };
    };
    const { multiple, fields } = runAfter.selector.object;
    expect(multiple).toBe(true);
    expect(Object.keys(fields)).toEqual(['device', 'after', 'max_wait']);
    for (const key of ['device', 'after']) {
      expect(fields[key].required).toBe(true);
      expect(fields[key].selector.entity).toEqual({ domain: 'sensor', device_class: 'power' });
    }
    expect(fields.max_wait.required).toBeFalsy();
    expect(fields.max_wait.selector.number).toBeDefined();
  });
});
