import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const n of process.argv.slice(2)) {
  await p.goto('file://' + process.cwd() + `/docs/record-detail/lissitzky/${n}.html`);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `docs/record-detail/lissitzky/${n}.png` });
}
await b.close();
