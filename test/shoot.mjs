// Headless screenshots of harness scenes through playwright-core (not a dependency of the widget):
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node test/shoot.mjs <port> <outdir> scene[:width][:extra query] ...
// Waits for onReady (html[data-ready]), then shoots the page and writes <shot>.log.json with host calls and console errors.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const [port, out, ...specs] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const spec of specs) {
  const [name, w0, extra] = spec.split(':');
  const w = Number(w0 || 380);
  const page = await browser.newPage({ viewport: { width: w + 32, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/test/frame.html?scene=${name}&w=${w}${extra ? '&' + extra : ''}`);
  let ready = true;
  try { await page.waitForSelector('html[data-ready]', { timeout: 10000 }); } catch { ready = false; }
  await page.waitForTimeout(/click=/.test(extra || '') ? 1500 : 400);
  const file = path.join(out, `${name}-${w}${extra ? '-' + extra.replace(/[=&.#\[\]]/g, '_') : ''}.png`);
  const height = await page.evaluate(() => document.body.scrollHeight + 32);
  await page.setViewportSize({ width: w + 32, height: Math.max(80, Math.min(height, 2000)) });
  await page.screenshot({ path: file });
  const log = await page.evaluate(() => ({ ready: document.documentElement.getAttribute('data-ready'), host: window.HOSTLOG || [] }));
  fs.writeFileSync(file.replace(/\.png$/, '.log.json'), JSON.stringify({ ready, ...log, errors }, null, 1));
  console.log(file, ready ? 'ready=' + log.ready : 'NOT READY', errors.length ? 'errors=' + errors.length : '');
  await page.close();
}
await browser.close();
