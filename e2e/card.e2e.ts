import { expect, type Page, test } from '@playwright/test';

// The preview page pins "now" to 17:10 (override with ?time=) and mocks Octopus data.
const open = async (page: Page, query: string) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/preview/index.html?${query}`);
  await expect(page.locator('energy-price-graph-card svg path').first()).toBeVisible();
  return errors;
};

test('shows now and next prices with an upcoming power down session', async ({ page }) => {
  const errors = await open(page, 'theme=dark');
  const labels = page.locator('energy-price-graph-card .label');
  await expect(labels.nth(0)).toHaveText('NOW · 17:00');
  await expect(labels.nth(1)).toHaveText('NEXT · 17:30 · POWER DOWN');
  await expect(page.locator('energy-price-graph-card .value').first()).toContainText('p/kWh');
  await expect(page.locator('energy-price-graph-card svg')).toContainText('POWER DOWN');
  await expect(page.locator('energy-price-graph-card svg')).toContainText('NOW');
  expect(errors).toEqual([]);
});

test('omits power down when there are no sessions', async ({ page }) => {
  await open(page, 'theme=dark&scenario=nosession');
  await expect(page.locator('energy-price-graph-card')).not.toContainText('POWER DOWN');
});

test('labels a negative price as FREE', async ({ page }) => {
  await open(page, 'theme=dark&time=03:10');
  await expect(page.locator('energy-price-graph-card .label').first()).toHaveText('NOW · 03:00 · FREE');
});

test('renders in the light theme', async ({ page }) => {
  await open(page, 'theme=light');
  await expect(page.locator('energy-price-graph-card .label').first()).toHaveText('NOW · 17:00');
});

for (const [width, hours] of [
  [360, 24],
  [360, 48],
  [560, 48],
] as const) {
  test(`x-axis labels do not overlap for ${hours}h at ${width}px`, async ({ page }) => {
    await open(page, `theme=dark&width=${width}&cfg=${JSON.stringify({ hours })}`);
    const boxes = await page.evaluate(() => {
      const svg = document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelector('svg');
      return [...(svg?.querySelectorAll('text.axis') ?? [])]
        .filter((t) => /^\d\d:\d\d$/.test(t.textContent ?? ''))
        .map((t) => {
          const r = t.getBoundingClientRect();
          return { text: t.textContent, left: r.left, right: r.right };
        })
        .sort((a, b) => a.left - b.left);
    });
    expect(boxes.length).toBeGreaterThan(1);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].left, `${boxes[i - 1].text} and ${boxes[i].text}`).toBeGreaterThanOrEqual(boxes[i - 1].right);
    }
  });
}

for (const width of [360, 560]) {
  test(`chart text is not clipped at ${width}px`, async ({ page }) => {
    await open(page, `theme=dark&width=${width}`);
    const clipped = await page.evaluate(() => {
      const svg = document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelector('svg');
      if (!svg) return ['no svg'];
      const box = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('text')]
        .filter((t) => {
          const r = t.getBoundingClientRect();
          return r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5;
        })
        .map((t) => t.textContent ?? '');
    });
    expect(clipped).toEqual([]);
  });

  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await open(page, `theme=dark&width=${width}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
