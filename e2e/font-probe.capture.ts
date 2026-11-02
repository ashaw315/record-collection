import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * **Which type does this machine actually draw?** Not a test: it prints what it
 * finds, for the same run on macOS and on Linux to be compared. The twelve Linux
 * failures assert text metrics in unrelated features, and a font that did not load
 * and a font that loaded and shapes differently need different fixes, so this asks
 * for both: what was asked for, which font drew it, and how wide fixed strings are.
 * Run with `npx playwright test --config=playwright.font-probe.config.ts`.
 */
const STRINGS = [
  ['None among these.', '13px', '400'],
  ['999 earlier covers', '11px', '400'],
  ['The whole collection', '11px', '500'],
  ['COLLECTION', '11px', '500'],
  ['Hamburgers quiver 0123456789', '16px', '400'],
];

test('font probe', async ({ page, browserName }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.evaluate(() => document.fonts.ready);
  const read = await page.evaluate((strings) => {
    const body = getComputedStyle(document.body);
    const family = body.fontFamily;
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').trim();
    const widths = strings.flatMap(([text, size, weight]) => [family, mono].map((f, i) => {
      const span = document.createElement('span');
      span.textContent = text;
      span.style.cssText = `position:absolute;white-space:nowrap;font-family:${f};font-size:${size};font-weight:${weight}`;
      document.body.append(span);
      const width = span.getBoundingClientRect().width;
      span.remove();
      return `${i === 0 ? 'sans' : 'mono'} ${size}/${weight} "${text}" ${width.toFixed(3)}`;
    }));
    return {
      fontsStatus: document.fonts.status,
      faces: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
      bodyFamily: family,
      monoVar: mono,
      dpr: window.devicePixelRatio,
      widths,
    };
  }, STRINGS);
  /* Chromium alone can say which font drew a node, as against which was asked for. */
  let drew: unknown = 'not available in this browser';
  if (browserName === 'chromium') {
    await page.evaluate(([sans, mono]) => {
      for (const [id, family] of [['probe-sans', sans], ['probe-mono', mono]]) {
        const span = document.createElement('span');
        span.id = id;
        span.textContent = 'Hamburgers quiver 0123456789';
        span.style.fontFamily = family;
        document.body.append(span);
      }
    }, [read.bodyFamily, read.monoVar]);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const fonts = async (selector: string) => {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      return (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
    };
    drew = { sans: await fonts('#probe-sans'), mono: await fonts('#probe-mono') };
  }
  const out = { platform: process.platform, browserName, project: info.project.name, ...read, drew };
  process.stdout.write(`\nFONTPROBE ${JSON.stringify(out)}\n`);
  writeFileSync(`font-probe-${process.platform}-${info.project.name}.json`, JSON.stringify(out, null, 2));
});
