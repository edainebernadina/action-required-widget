// node test/unit.mjs : checks the logic ported from Must Reads and Waiting for you.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { idList, spaceSelection, ALL_SPACES, buildRows, dueFromTags, fmtDay, mergePrefsBag, doneFromPrefs, readMinutes, taskKey, filterPending, filterSpacePages, sectionList } from '../src/logic.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
let n = 0; const t = (name, fn) => { fn(); n += 1; console.log('ok', name); };

t('task key matches Waiting for you 1.0.0', () => assert.equal(taskKey('Confirm your emergency contact'), 'tl54tic'));
t('due tag, earliest wins', () => assert.equal(fmtDay(dueFromTags(['x', 'due-2026-10-30', 'DUE-2026-10-09'], 'due-')), 'Fri 9 Oct'));
t('custom due prefix', () => assert.equal(dueFromTags(['by-2026-10-09'], 'due-'), null));
t('read time from captionContent', () => {
  const p = fx('post-ack.json');
  assert.ok(readMinutes(p, 200) >= 1);
  assert.equal(readMinutes({ caption: 'word '.repeat(450) }, 200), 2);
  assert.equal(readMinutes({ caption: '' }, 200), 1);
});
t('prefs merge keeps other keys and earlier done', () => {
  const bag = mergePrefsBag({ additionalProperties: { digest: { seenIds: ['a'] }, waitingForYou: { done: { old: '1' } } } }, { tl54tic: '2' });
  assert.deepEqual(bag, { digest: { seenIds: ['a'] }, waitingForYou: { done: { old: '1', tl54tic: '2' } } });
  assert.deepEqual(mergePrefsBag({}, { a: 1 }), { waitingForYou: { done: { a: 1 } } });
  assert.deepEqual(doneFromPrefs({ additionalProperties: null }), { ok: true, done: {} });
  assert.equal(doneFromPrefs({ additionalProperties: 'x' }).ok, false);
});
t('sections arrive as rows, {value}, or JSON', () => {
  const rows = [{ title: { value: 'A' }, note: 'n' }];
  assert.deepEqual(sectionList(rows, ['title', 'note']), [{ title: 'A', note: 'n' }]);
  assert.deepEqual(sectionList({ value: rows }, ['title']), [{ title: 'A' }]);
  assert.deepEqual(sectionList(JSON.stringify([{ title: 'B' }]), ['title']), [{ title: 'B' }]);
});
t('1.1.2 defaults: first five pending in API order, no lines', () => {
  const items = fx('pending.json').items;
  const rows = buildRows(filterPending(items, {}).map((post) => ({ post, acknowledged: false })), { maxItems: 5 }, {}, {});
  assert.deepEqual(rows.map((r) => r.title), items.slice(0, 5).map((p) => p.title));
  assert.ok(rows.every((r) => r.line === '' && r.kind === 'ack'));
});
t('space filter and tag filter on pending', () => {
  const items = fx('pending.json').items;
  const one = filterPending(items, { spaceId: '8AEBBD86-A771-4A48-AB4A-97A636D93738', tag: 'must-read' });
  assert.equal(one.length, 5);
  assert.equal(filterPending(items, { spaceId: 'a, 8aebbd86-a771-4a48-ab4a-97a636d93738' }).length, 12);
});
t('space pages: tag backstop, oldest first', () => {
  const pages = filterSpacePages(fx('space-pages.json').items, { tag: 'must-read' });
  assert.equal(pages.length, 5);
  assert.equal(pages[0].title, 'Code of Conduct');
});
t('must reads rows: Acknowledged or read time', () => {
  const pages = filterSpacePages(fx('space-pages.json').items, { tag: 'must-read' });
  const cfg = { showCompleted: true, showReadTime: true, maxItems: 5 };
  const rows = buildRows(pages.map((post, i) => ({ post, acknowledged: i === 0 })), cfg, {}, {});
  assert.equal(rows[0].line, 'Acknowledged');
  assert.match(rows[1].line, /^Read, \d+ min$/);
  assert.equal(buildRows(pages.map((post, i) => ({ post, acknowledged: i === 0 })), { ...cfg, showCompleted: false }, {}, {}).length, 4);
});
t('waiting for you: due order, task merged, done task hidden', () => {
  const items = fx('wfy-pending.json').items;
  const tasks = [{ title: 'Confirm your emergency contact', note: 'Takes one minute', linkUrl: '', dueDate: '2026-10-16' }];
  const cfg = { spaceId: 'd78a3fdd-4f89-428c-b65f-cabfc3013434', showDueDates: true, tasks, maxItems: 5 };
  const content = filterPending(items, cfg).map((post) => ({ post, acknowledged: false }));
  const rows = buildRows(content, cfg, {}, {});
  assert.deepEqual(rows.map((r) => r.title), ['Hybrid working policy 2027', 'Confirm your emergency contact', 'Code of Conduct, yearly refresh']);
  assert.equal(rows[0].line, 'Read and acknowledge by Fri 9 Oct');
  assert.equal(rows[1].line, 'Takes one minute');
  assert.equal(buildRows(content, cfg, { tl54tic: 'x' }, {}).length, 2);
  assert.equal(buildRows(content, cfg, { tl54tic: 'x' }, { tl54tic: true }).length, 3);
});
t('spaceId: every stored shape gives the same ids', () => {
  const A = '8aebbd86-a771-4a48-ab4a-97a636d93738';
  const B = 'd78a3fdd-4f89-428c-b65f-cabfc3013434';
  assert.deepEqual(idList(A), [A]);                                  // 2.0.0 text, one id
  assert.deepEqual(idList(A.toUpperCase() + ', ' + B + ';' + A), [A, B]); // 2.0.0 comma list
  assert.deepEqual(idList([A, B]), [A, B]);                            // 3.0.0 Space picker
  assert.deepEqual(idList({ value: [B] }), [B]);                       // picker wrapped in value
  assert.deepEqual(idList([{ id: A }]), [A]);                          // rows with an id
  assert.deepEqual(idList(JSON.stringify([A])), [A]);                  // JSON string
  assert.deepEqual(idList(''), []);
  assert.deepEqual(idList([]), []);
  assert.deepEqual(idList(null), []);
});
t('pending filter accepts the picker array', () => {
  const items = fx('pending.json').items;
  assert.equal(filterPending(items, { spaceId: ['8aebbd86-a771-4a48-ab4a-97a636d93738'] }).length, 12);
});
t('Show more: limit overrides maxItems, capped at 50', () => {
  const items = fx('pending.json').items;
  const content = filterPending(items, {}).map((post) => ({ post, acknowledged: false }));
  assert.equal(buildRows(content, { maxItems: 3 }, {}, {}).length, 3);
  assert.equal(buildRows(content, { maxItems: 3, limit: 50 }, {}, {}).length, items.length);
});
t('picker specials: All Spaces and the Current Space token', () => {
  const A = '8aebbd86-a771-4a48-ab4a-97a636d93738';
  assert.deepEqual(spaceSelection([ALL_SPACES]), { ids: [], all: true, unresolved: [] });
  assert.deepEqual(spaceSelection(['currentSpace']), { ids: [], all: false, unresolved: ['currentspace'] });
  assert.deepEqual(spaceSelection([A, ALL_SPACES]).ids, [A]);
  const items = fx('pending.json').items;
  assert.equal(filterPending(items, { spaceId: [ALL_SPACES] }).length, items.length);
});
console.log(n, 'passed');
