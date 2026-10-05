// Headless check of every Widget Lab matrix cell and every harness scene,
// through playwright-core (not a dependency of the widget). Build first
// (npm run build), start the harness (npm run serve), then:
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node test/check.mjs <port> [outdir]
//
// For each cell and scene: loads test/frame.html at the cell width, waits for
// onReady (html[data-ready]) or, for the loading state, the aria-busy
// skeleton, then checks: onReady fired exactly once, no page errors, no
// unexpected console errors, and what is on screen (rows, placeholder,
// skeleton, editor note, positive empty, hidden, quiet error). Writes a PNG
// per check and a summary.json to outdir.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const [port = '4717', out = 'test/out'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const SIZES = [['mobile', 343], ['small', 327], ['medium', 630], ['large', 1024]];
const STATES = ['default', 'placeholder', 'loading', 'empty'];
const LAYOUTS = ['cards', 'list'];
const ROLES = ['editor', 'employee'];

function expectFor(state) {
  if (state === 'default') return 'rows';
  if (state === 'placeholder') return 'placeholder';
  if (state === 'loading') return 'loading';
  return 'positive'; // nothing waiting: the positive empty, for everyone
}

const checks = [];
for (const layout of LAYOUTS) {
  for (const role of ROLES) {
    for (const state of STATES) {
      for (const [size, w] of SIZES) {
        checks.push({ name: `matrix-${layout}-${role}-${state}-${size}`, w, q: `bare=1&layout=${layout}&state=${state}&role=${role}`, expect: expectFor(state) });
      }
    }
    for (const kind of ['nothing', 'setup']) {
      for (const [size, w] of [['small', 327], ['large', 1024]]) {
        checks.push({ name: `empty-${kind}-${layout}-${role}-${size}`, w, q: `bare=1&layout=${layout}&state=empty&empty=${kind}&role=${role}`, expect: role === 'editor' ? 'editor' : 'hidden' });
      }
    }
  }
  for (const [size, w] of SIZES) checks.push({ name: `matrix-${layout}-noaccess-default-${size}`, w, q: `bare=1&layout=${layout}&state=default&role=noaccess`, expect: 'hidden' });
  checks.push({ name: `noaccess-editor-${layout}`, w: 630, q: `bare=1&layout=${layout}&state=default&nogrant=1`, expect: 'editor' });
}

// [scene or query, expectation]. Default role is editor.
const SCENES = [
  // 1.1.2 and 2.0.0 scenes, kept
  ['scene=cards', 'rows'], ['scene=cards-3', 'rows'], ['scene=cards-1', 'rows'], ['scene=cards-label', 'rows'],
  ['scene=cards-empty', 'positive'], ['scene=cards-empty&role=employee', 'positive'],
  ['scene=cards-error', 'errorDetail'], ['scene=cards-error&role=employee', 'error'],
  ['scene=must', 'rows'], ['scene=must-two', 'rows'], ['scene=must-ignored', 'rows'], ['scene=must-pending-only', 'rows'],
  ['scene=must-all-pages', 'rows'], ['scene=must-unknown-tag', 'editor'], ['scene=must-unknown-tag&role=employee', 'hidden'],
  ['scene=must-nospace', 'editor'], ['scene=must-nospace&role=employee', 'hidden'],
  ['scene=must-500', 'errorDetail'], ['scene=must-500&role=employee', 'error'], ['scene=must-nogrant', 'rows'],
  ['scene=wait', 'rows'], ['scene=wait-all', 'rows'], ['scene=wait-done', 'rows'], ['scene=wait-live', 'rows'],
  ['scene=wait-empty', 'positive'], ['scene=wait-fail', 'errorDetail'], ['scene=wait-fail&role=employee', 'error'],
  ['scene=wait-fail-tasks', 'rows'], ['scene=wait-opaque', 'rows'], ['scene=cards-mixed', 'rows'], ['scene=cards-space', 'rows'],
  // product-standard scenes
  ['scene=wait&slow=1', 'rows'], ['scene=wait&theme=none', 'rows'], ['scene=wait&debug=1&role=employee', 'rows'],
  ['scene=cards&opaque=1', 'errorDetail'], ['scene=cards&opaque=1&role=employee', 'error'],
  ['scene=must&nogrant=1', 'editor'], ['scene=must&nogrant=1&role=employee', 'hidden'],
  ['scene=cards&fail=1&role=employee', 'error'],
  // old stored config shapes (spaceId became a Space picker in 3.0.0)
  ['scene=picker-space', 'rows'], ['scene=picker-two-spaces', 'rows'], ['scene=picker-pending', 'rows'], ['scene=picker-empty-pending', 'rows'],
  ['scene=picker-all-pending', 'rows'], ['scene=picker-all-space', 'editor'], ['scene=picker-all-space&role=employee', 'hidden'],
  ['scene=picker-current-space', 'editor'], ['scene=picker-current-space&role=employee', 'hidden'],
  ['scene=picker-current-pending', 'editor'], ['scene=picker-current-pending&role=employee', 'hidden'],
  ['scene=old-id-string', 'rows'], ['scene=old-comma-list', 'rows'], ['scene=old-json-string', 'rows'], ['scene=v2-stored-defaults', 'rows'],
  // new settings
  ['scene=show-more', 'rows'], ['scene=cards-show-more', 'rows'], ['scene=list-new-tab', 'rows'],
  ['scene=show-more&click=.ar-more', 'rows'], ['scene=wait&click=.ar-done', 'rows']
];
for (const [q, expect] of SCENES) {
  for (const [size, w] of [['small', 327], ['large', 1024]]) {
    checks.push({ name: `scene-${q.replace(/scene=/, '').replace(/[=&.]/g, '_')}-${size}`, w, q: 'bare=1&' + q, expect });
  }
}

// Console errors the widget logs on purpose on an error path.
function expectedError(text, c) {
  if (/\[ActionRequired\] failed to load/.test(text)) return /fail|opaque|nogrant|noaccess|error|500|nospace|-fail/.test(c.q);
  return false;
}

const browser = await chromium.launch();
const results = [];
for (const c of checks) {
  const page = await browser.newPage({ viewport: { width: c.w, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !expectedError(m.text(), c)) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  await page.goto(`http://localhost:${port}/test/frame.html?${c.q}`);
  let ok = true;
  const notes = [];
  try {
    if (c.expect === 'loading') await page.waitForSelector('[aria-busy="true"]', { state: 'attached', timeout: 8000 });
    else await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 10000 });
  } catch { ok = false; notes.push('never ready'); }
  await page.waitForTimeout(/click=/.test(c.q) ? 1200 : 400);
  const seen = await page.evaluate(() => ({
    ready: Number(document.documentElement.getAttribute('data-ready') || 0),
    rows: document.querySelectorAll('.ar-root:not(.ar-skel):not(.ar-placeholder) .ar-card, .ar-root:not(.ar-skel):not(.ar-placeholder) .ar-row').length,
    placeholder: !!document.querySelector('.ar-placeholder[aria-hidden="true"]'),
    loading: !!document.querySelector('.ar-skel[aria-busy="true"]'),
    editor: !!document.querySelector('.ar-editor-note'),
    positive: !!document.querySelector('.ar-empty.is-positive') && !document.querySelector('.ar-editor-note'),
    error: !!document.querySelector('.ar-error'),
    errorDetail: !!document.querySelector('.ar-error-detail'),
    bodyHeight: document.body.scrollHeight,
    rootText: (document.getElementById('root') || {}).textContent || '',
    band: document.body.className,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  if (c.expect !== 'loading' && seen.ready !== 1) { ok = false; notes.push('onReady x' + seen.ready); }
  if (c.expect === 'loading' && seen.ready !== 0) { ok = false; notes.push('onReady during loading'); }
  const want = {
    rows: seen.rows > 0,
    placeholder: seen.placeholder,
    loading: seen.loading,
    editor: seen.editor,
    positive: seen.positive,
    hidden: seen.rootText.trim() === '' && seen.bodyHeight <= 1,
    error: seen.error && !seen.errorDetail,
    errorDetail: seen.error && seen.errorDetail
  }[c.expect];
  if (!want) { ok = false; notes.push('expected ' + c.expect + ', saw ' + JSON.stringify({ rows: seen.rows, editor: seen.editor, positive: seen.positive, error: seen.error, h: seen.bodyHeight })); }
  if (seen.overflowX) { ok = false; notes.push('scrolls sideways'); }
  if (errors.length) { ok = false; notes.push('console: ' + errors.join(' | ')); }
  const file = path.join(out, c.name + '.png');
  const h = await page.evaluate(() => Math.max(40, document.body.scrollHeight));
  await page.setViewportSize({ width: c.w, height: Math.min(h, 2400) });
  await page.screenshot({ path: file });
  results.push({ name: c.name, ok, expect: c.expect, band: seen.band, notes });
  if (!ok) console.log('FAIL', c.name, notes.join('; '));
  await page.close();
}
await browser.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ total: results.length, failed: failed.length, results }, null, 1));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
