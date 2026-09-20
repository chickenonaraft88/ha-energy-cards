import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

// The preview page pins "now" to 17:10 (override with ?time=) and mocks Octopus data.
const open = async (page: Page, query: string) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/preview/index.html?${query}`);
  await expect(page.locator('energy-price-graph-card svg path').first()).toBeVisible();
  return errors;
};

test('logs the package version, not a hard-coded one', async ({ page }) => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await open(page, 'theme=dark');
  expect(logs.find((l) => l.includes('ENERGY-PRICE-GRAPH-CARD'))).toContain(` v${version} `);
});

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

// A sensor that already reports pence is configured with rate_multiplier 1; its prices still colour on the pence bands.
test('colours a pence entity by pence, not by £', async ({ page }) => {
  await open(page, 'theme=dark&entity=pence&cfg={"rate_multiplier":1}');
  await expect(page.locator('energy-price-graph-card .value').first()).toContainText('33.70');
  await expect(page.locator('energy-price-graph-card .value').first()).toHaveCSS('color', 'rgb(255, 69, 58)');
  await page.goto('/preview/index.html?theme=dark&entity=pence&time=13:10&cfg={"rate_multiplier":1}');
  await expect(page.locator('energy-price-graph-card .value').first()).toContainText('8.');
  await expect(page.locator('energy-price-graph-card .value').first()).not.toHaveCSS('color', 'rgb(255, 69, 58)');
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

for (const [height, expected] of [
  [0, 100],
  [20, 100],
  [9000, 500],
] as const) {
  test(`clamps a YAML height of ${height} to ${expected}px`, async ({ page }) => {
    await open(page, `theme=dark&cfg=${JSON.stringify({ height })}`);
    const svg = page.locator('energy-price-graph-card svg');
    await expect(svg).toHaveAttribute('height', String(expected));
    await expect(svg.locator('path').first()).toBeVisible();
  });
}

// At 18:10 the 17:30 session is already running, so its badge is pinned to the left edge next to the NOW badge.
for (const width of [360, 560]) {
  test(`NOW and POWER DOWN badges do not overlap during an active session at ${width}px`, async ({ page }) => {
    await open(page, `theme=dark&time=18:10&width=${width}`);
    const boxes = await page.evaluate(() => {
      const svg = document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelector('svg');
      const rectOf = (label: string) =>
        [...(svg?.querySelectorAll('text') ?? [])]
          .find((t) => t.textContent === label)
          ?.previousElementSibling?.getBoundingClientRect();
      const pick = (r?: DOMRect) => r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      return { now: pick(rectOf('NOW')), session: pick(rectOf('POWER DOWN')) };
    });
    const { now, session } = boxes;
    expect(now).toBeTruthy();
    expect(session).toBeTruthy();
    expect(session?.top, 'badges sit at the same height').toBe(now?.top);
    const apart = now && session && (now.right <= session.left || session.right <= now.left || now.bottom <= session.top || session.bottom <= now.top);
    expect(apart, JSON.stringify(boxes)).toBe(true);
  });
}

test('follows a resize after the card is detached and re-attached', async ({ page }) => {
  await open(page, 'theme=dark&width=560');
  const svgWidth = () =>
    page.evaluate(() => document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelector('svg')?.clientWidth);
  expect(await svgWidth()).toBe(560);
  // HA moves cards around (edit mode, view changes); nothing re-renders the card while it is out of the DOM.
  await page.evaluate(() => {
    const host = document.getElementById('card') as HTMLElement;
    const card = host.firstElementChild as Element;
    card.remove();
    host.style.width = '360px';
    host.appendChild(card);
  });
  await expect.poll(svgWidth).toBe(360);
  await page.evaluate(() => {
    (document.getElementById('card') as HTMLElement).style.width = '480px';
  });
  await expect.poll(svgWidth).toBe(480);
});

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
