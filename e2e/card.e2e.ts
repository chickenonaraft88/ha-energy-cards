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

test('shows no battery track unless Predbat is configured', async ({ page }) => {
  await open(page, 'theme=dark');
  await expect(page.locator('energy-price-graph-card svg g.battery')).toHaveCount(0);
  await expect(page.locator('energy-price-graph-card .legend')).toHaveCount(0);
});

test('draws the Predbat plan as a track that stays clear of the x-axis and labels that fit their bars', async ({
  page,
}) => {
  const errors = await open(page, 'theme=dark&predbat=1');
  await expect(page.locator('energy-price-graph-card .legend')).toContainText('Predbat plan');
  const bars = page.locator('energy-price-graph-card svg g.battery > g.window');
  expect(await bars.count()).toBeGreaterThan(5);
  await expect(bars.first().locator('title')).toHaveCount(1);

  const geometry = await page.evaluate(() => {
    const svg = document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelector('svg');
    const bottom = (el: Element) => el.getBoundingClientRect().bottom;
    const track = svg?.querySelector('g.battery > rect');
    const axisTop = Math.min(
      ...[...(svg?.querySelectorAll('text.axis') ?? [])]
        .filter((t) => /^\d\d:\d\d$/.test(t.textContent ?? ''))
        .map((t) => t.getBoundingClientRect().top),
    );
    const overflowing = [...(svg?.querySelectorAll('g.battery > g.window') ?? [])].flatMap((g) => {
      const text = g.querySelector('text');
      const rect = g.querySelector('rect');
      if (!text || !rect) return [];
      const [t, r] = [text.getBoundingClientRect(), rect.getBoundingClientRect()];
      return t.left < r.left || t.right > r.right ? [text.textContent] : [];
    });
    return { trackBottom: track ? bottom(track) : NaN, axisTop, overflowing };
  });
  expect(geometry.trackBottom).toBeLessThanOrEqual(geometry.axisTop);
  expect(geometry.overflowing).toEqual([]);
  expect(errors).toEqual([]);
});

test('keeps the plot the same height when the Predbat track is added', async ({ page }) => {
  await open(page, 'theme=dark');
  const plain = await page.locator('energy-price-graph-card svg').first().boundingBox();
  await open(page, 'theme=dark&predbat=1');
  const withTrack = await page.locator('energy-price-graph-card svg').first().boundingBox();
  expect(withTrack?.height).toBe((plain?.height ?? 0) + 22);
});

test('shows no track or legend when the Predbat entities do not exist', async ({ page }) => {
  const errors = await open(page, 'theme=dark&predbat=1&cfg={"predbat_prefix":"nope"}');
  await expect(page.locator('energy-price-graph-card svg g.battery')).toHaveCount(0);
  await expect(page.locator('energy-price-graph-card .legend')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('fills the chart with dashed Predbat prices behind a dotted divider where the real rates end', async ({ page }) => {
  const errors = await open(page, 'theme=dark&predbat=1&until=23');
  const svg = page.locator('energy-price-graph-card svg').first();
  await expect(svg.locator('line.forecast-divider')).toHaveCount(1);
  await expect(svg.locator('path.forecast')).toHaveCount(2);
  await expect(svg).toContainText('PREDICTED');
  await expect(page.locator('energy-price-graph-card .legend')).toContainText('Predbat prices');

  const geometry = await page.evaluate(() => {
    const s = document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelector('svg');
    const box = (el: Element | null | undefined) => el?.getBoundingClientRect();
    const divider = box(s?.querySelector('line.forecast-divider'));
    const svgBox = box(s);
    const badge = [...(s?.querySelectorAll('text') ?? [])].find((t) => t.textContent === 'PREDICTED');
    const now = [...(s?.querySelectorAll('text') ?? [])].find((t) => t.textContent === 'NOW');
    const [b, n] = [box(badge), box(now)];
    return {
      dividerX: divider?.left ?? NaN,
      right: svgBox?.right ?? NaN,
      badgeRight: b?.right ?? NaN,
      badgeLeft: b?.left ?? NaN,
      nowRight: n?.right ?? NaN,
    };
  });
  expect(geometry.badgeRight).toBeLessThanOrEqual(geometry.right);
  expect(geometry.badgeLeft).toBeGreaterThanOrEqual(geometry.nowRight);
  expect(errors).toEqual([]);
});

test('draws no forecast when the real rates cover the whole chart, or it is switched off', async ({ page }) => {
  await open(page, 'theme=dark&predbat=1');
  await expect(page.locator('energy-price-graph-card svg line.forecast-divider')).toHaveCount(0);
  await expect(page.locator('energy-price-graph-card .legend')).not.toContainText('Predbat prices');
  await open(page, 'theme=dark&predbat=1&until=23&cfg={"predbat_rates":false}');
  await expect(page.locator('energy-price-graph-card svg line.forecast-divider')).toHaveCount(0);
});

for (const width of [360, 560]) {
  test(`PREDICTED badge stays clear of NOW and POWER DOWN at ${width}px`, async ({ page }) => {
    await open(page, `theme=dark&predbat=1&until=23&time=13:30&width=${width}`);
    const boxes = await page.evaluate(() => {
      const texts = [...(document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelectorAll('svg text') ?? [])];
      const box = (label: string) => {
        const r = texts.find((t) => t.textContent === label)?.previousElementSibling?.getBoundingClientRect();
        return r ? { left: r.left, right: r.right } : undefined;
      };
      return { now: box('NOW'), power: box('POWER DOWN'), predicted: box('PREDICTED') };
    });
    for (const other of [boxes.now, boxes.power]) {
      expect(other).toBeDefined();
      const clear = (boxes.predicted?.left ?? 0) >= (other?.right ?? Infinity) || (boxes.predicted?.right ?? Infinity) <= (other?.left ?? 0);
      expect(clear, JSON.stringify(boxes)).toBe(true);
    }
  });
}

test('joins the predicted line to the end of the real one', async ({ page }) => {
  await open(page, 'theme=dark&predbat=1&until=23');
  const ends = await page.evaluate(() => {
    const s = document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelector('svg');
    const point = (d: string | null | undefined, which: 'first' | 'last') => {
      const pts = [...(d ?? '').matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      return pts[which === 'first' ? 0 : pts.length - 1];
    };
    return {
      realEnd: point(s?.querySelector('path.price-line')?.getAttribute('d'), 'last'),
      joinStart: point(s?.querySelector('path.forecast-join')?.getAttribute('d'), 'first'),
      joinEnd: point(s?.querySelector('path.forecast-join')?.getAttribute('d'), 'last'),
      forecastStart: point(s?.querySelector('path.forecast[fill="none"]')?.getAttribute('d'), 'first'),
    };
  });
  expect(ends.realEnd).toBeDefined();
  expect(ends.joinStart).toEqual(ends.realEnd);
  expect(ends.joinEnd).toEqual(ends.forecastStart);
});

// Pointer position for a time of day, given the preview's 24h span from 17:00 (x maths mirrors src/hover.ts).
const pointAt = async (page: Page, hoursFromStart: number) => {
  const box = await page.locator('energy-price-graph-card .chart').boundingBox();
  if (!box) throw new Error('no chart');
  const plotW = box.width - 36 - 16;
  return { x: box.x + 36 + (hoursFromStart / 24) * plotW, y: box.y + box.height / 2 };
};

test('hovering the chart shows the slot time, price and incentive', async ({ page }) => {
  await open(page, 'theme=dark');
  const tip = page.locator('energy-price-graph-card .tooltip');
  await expect(tip).toHaveCount(0);
  const p = await pointAt(page, 0.75);
  await page.mouse.move(p.x, p.y);
  await expect(tip).toContainText('17:30–18:00');
  await expect(tip).toContainText('p/kWh');
  await expect(tip).toContainText('POWER DOWN');
  await expect(tip).not.toContainText('Predbat');
  await expect(page.locator('energy-price-graph-card .hover-band')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
});

test('the tooltip shows the Predbat plan and marks predicted prices', async ({ page }) => {
  await open(page, 'theme=dark&predbat=1&until=23');
  const tip = page.locator('energy-price-graph-card .tooltip');
  const p = await pointAt(page, 0.75);
  await page.mouse.move(p.x, p.y);
  await expect(tip).toContainText('Predbat: ');
  // `until=23` ends the real rates at 23:00 (6h in), so the rest of the chart is Predbat's forecast.
  const late = await pointAt(page, 12);
  await page.mouse.move(late.x, late.y);
  await expect(tip).toContainText('Predicted by Predbat');
});

test('the tooltip stays inside the card at either edge', async ({ page }) => {
  await open(page, 'theme=dark&predbat=1&width=360');
  const card = await page.locator('energy-price-graph-card ha-card').boundingBox();
  for (const h of [0.1, 23.9]) {
    const p = await pointAt(page, h);
    await page.mouse.move(p.x, p.y);
    const tip = await page.locator('energy-price-graph-card .tooltip').boundingBox();
    expect(tip && card && tip.x >= card.x && tip.x + tip.width <= card.x + card.width, `${h}h`).toBe(true);
  }
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('tapping the chart shows the tooltip and tapping elsewhere hides it', async ({ page }) => {
    await open(page, 'theme=dark&width=360');
    const tip = page.locator('energy-price-graph-card .tooltip');
    const p = await pointAt(page, 0.75);
    await page.touchscreen.tap(p.x, p.y);
    await expect(tip).toContainText('17:30–18:00');
    // Lifting the finger doesn't dismiss it.
    await page.waitForTimeout(200);
    await expect(tip).toHaveCount(1);
    const header = await page.locator('energy-price-graph-card .header').boundingBox();
    if (!header) throw new Error('no header');
    await page.touchscreen.tap(header.x + 20, header.y + 10);
    await expect(tip).toHaveCount(0);
  });
});
