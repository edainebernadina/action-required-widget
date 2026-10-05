/*
 * Pure helpers for Action Required 2.0. No DOM, no Widget API, so test/unit.mjs
 * can run them in node.
 *
 * Ported from the two widgets this release replaces:
 *  - Must Reads (widget-must-reads 1.0.0): word count from captionContent,
 *    read time, tag filter backstop, oldest-first order.
 *  - Waiting for you (widget-waiting-for-you 1.0.0): due-YYYY-MM-DD tags,
 *    en-GB day format, task keys, space filter, preference merge.
 */

import { t } from './strings.js';

// ---- config ---------------------------------------------------------------

export const PREF_KEY = 'waitingForYou';

export const bool = (v) => v === true || v === 'true';

const sectionValue = (section, name) => {
  if (!section) return '';
  let raw = section[name];
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw) raw = raw.value;
  return raw == null ? '' : raw;
};

/** A `sections` setting arrives as an array of rows (or {value: [...]}, or a JSON string). */
export const sectionList = (raw, names) => {
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch (e) { list = []; }
  }
  if (list && !Array.isArray(list) && Array.isArray(list.value)) list = list.value;
  return (Array.isArray(list) ? list : []).map((row) => {
    const out = {};
    names.forEach((n) => { out[n] = String(sectionValue(row, n)).trim(); });
    return out;
  });
};

/**
 * Space ids, from every shape the spaceId setting has had:
 *  - 3.0.0 Space picker (feedPicker): ["<id>", ...], possibly as {value: [...]}
 *    or rows like {id}
 *  - up to 2.0.0 text field: one id, or several separated by commas
 *  - a JSON string of either
 * Returns lower-case ids, no blanks, no duplicates.
 */
export const idList = (raw) => {
  let v = raw;
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) v = v.value;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^[[{"]/.test(s)) {
      try { v = JSON.parse(s); } catch (e) { v = s; }
    }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) v = [v];
  const parts = Array.isArray(v)
    ? v.map((x) => (x && typeof x === 'object' ? (x.id || x.feedId || x.value || '') : x))
    : String(v || '').split(/[\s,;]+/);
  const out = [];
  parts.forEach((p) => {
    const id = String(p == null ? '' : p).trim().toLowerCase();
    if (id && out.indexOf(id) === -1) out.push(id);
  });
  return out;
};

export const ALL_SPACES = '00000000-0000-0000-0000-000000000000';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * What the Space picker value means (verified live, 5 Oct 2026):
 *  - all:        the picker's "All Spaces" value (the zero GUID)
 *  - unresolved: the "Current Space" token (any non-GUID value); a custom
 *                widget cannot tell which Space it sits in, so this counts as
 *                not set up and editors are told
 *  - ids:        real Space, Channel or topic ids
 */
export const spaceSelection = (raw) => {
  const out = { ids: [], all: false, unresolved: [] };
  idList(raw).forEach((id) => {
    if (id === ALL_SPACES) out.all = true;
    else if (GUID.test(id)) out.ids.push(id);
    else out.unresolved.push(id);
  });
  return out;
};

/** Ids to filter on: none (every Space) when "All Spaces" is among them. */
export const splitIds = (raw) => {
  const sel = spaceSelection(raw);
  return sel.all ? [] : sel.ids;
};

// ---- dates (local calendar days, en-GB "Fri 9 Oct") -----------------------

export const parseDay = (text) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || '').trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

export const fmtDay = (d) => {
  try {
    return new Intl.DateTimeFormat(t('dateLocale'), { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  } catch (e) {
    return d.toDateString();
  }
};

/** Earliest date from a tag such as due-2026-10-09 (prefix is configurable). */
export const dueFromTags = (tags, prefix) => {
  const p = String(prefix || 'due-').toLowerCase();
  let found = null;
  (tags || []).forEach((t) => {
    const s = String(t || '').toLowerCase();
    if (s.indexOf(p) === 0) {
      const d = parseDay(s.slice(p.length));
      if (d && (!found || d < found)) found = d;
    }
  });
  return found;
};

// ---- read time --------------------------------------------------------------

/** Words in the page body (captionContent blocks, which matches the page's numberOfWords). */
export const wordCount = (post) => {
  const blocks = post && post.captionContent && post.captionContent.content && post.captionContent.content.blocks;
  const text = Array.isArray(blocks)
    ? blocks.map((b) => (b && b.text) || '').join(' ')
    : String((post && post.caption) || '');
  return text.trim().split(/\s+/).filter(Boolean).length;
};

export const readMinutes = (post, wordsPerMinute) => {
  const wpm = Math.max(100, Math.min(400, Number(wordsPerMinute) || 200));
  return Math.max(1, Math.round(wordCount(post) / wpm));
};

// ---- tasks and preferences --------------------------------------------------

/** Same key as Waiting for you 1.0.0, so a task ticked off there stays off here. */
export const taskKey = (text) => {
  let h = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 't' + (h >>> 0).toString(36);
};

/** Read the ticked-off map out of a userpreference body. */
export const doneFromPrefs = (prefs) => {
  const bag = prefs && prefs.additionalProperties;
  if (bag == null) return { ok: true, done: {} };
  if (typeof bag !== 'object' || Array.isArray(bag)) return { ok: false, done: {} };
  const mine = bag[PREF_KEY];
  return { ok: true, done: (mine && mine.done) || {} };
};

/**
 * PATCH replaces the whole additionalProperties bag: start from the bag as it
 * is right now, keep every other key, and merge our done map into ours.
 */
export const mergePrefsBag = (prefs, done) => {
  const bag = prefs && prefs.additionalProperties && typeof prefs.additionalProperties === 'object'
    ? prefs.additionalProperties : {};
  const mine = bag[PREF_KEY] && typeof bag[PREF_KEY] === 'object' ? bag[PREF_KEY] : {};
  const merged = {};
  Object.keys(mine.done || {}).forEach((k) => { merged[k] = mine.done[k]; });
  Object.keys(done || {}).forEach((k) => { merged[k] = done[k]; });
  const next = {};
  Object.keys(bag).forEach((k) => { next[k] = bag[k]; });
  next[PREF_KEY] = { done: merged };
  return next;
};

// ---- items ------------------------------------------------------------------

const hasTag = (post, tag) => {
  const want = String(tag || '').trim().toLowerCase();
  if (!want) return true;
  return (post.tags || []).some((t) => String(t).toLowerCase() === want);
};

const inSpaces = (post, spaces) => {
  if (!spaces.length) return true;
  const ids = [String(post.channelId || '').toLowerCase()]
    .concat((post.feeds || []).map((f) => String((f && f.id) || '').toLowerCase()));
  return ids.some((id) => spaces.indexOf(id) !== -1);
};

/** Pending scope: the viewer's pending items, optionally from some spaces and with a tag. API order kept. */
export const filterPending = (posts, cfg) => {
  const spaces = splitIds(cfg.spaceId);
  return (posts || []).filter((p) => p && inSpaces(p, spaces) && hasTag(p, cfg.tag));
};

/** Space scope: published pages carrying the tag, oldest first. */
export const filterSpacePages = (posts, cfg) => {
  const pages = (posts || []).filter((p) => {
    if (!p || !p.id || String(p.status || 'Published') === 'Draft') return false;
    if (String(p.postType || 'Page').toLowerCase() !== 'page') return false;
    // Backstop: some listings ignore a filter they document.
    return hasTag(p, cfg.tag);
  });
  const t = (p) => Date.parse(p.publishedAt || p.createdAt || '') || 0;
  return pages.slice().sort((a, b) => t(a) - t(b));
};

/**
 * One list: content items and tasks.
 * content: [{ post, acknowledged }]; returns rows the UI renders, capped at maxItems.
 * Rows: { kind: 'ack'|'task', key, title, post?, url?, acknowledged, due, minutes, line }
 */
export const buildRows = (content, cfg, done, justDone) => {
  const rows = [];
  const showDue = bool(cfg.showDueDates);
  const showRead = bool(cfg.showReadTime);
  (content || []).forEach(({ post, acknowledged }) => {
    if (acknowledged && !bool(cfg.showCompleted)) return;
    const due = showDue && !acknowledged ? dueFromTags(post.tags, cfg.dueTagPrefix) : null;
    const minutes = showRead ? readMinutes(post, cfg.wordsPerMinute) : 0;
    let line = '';
    if (acknowledged) line = String(cfg.acknowledgedLabel || t('acknowledgedLabel'));
    else if (due) line = String(cfg.dueLabel || t('dueLabel')).replace(/\{date\}/g, fmtDay(due));
    else if (showRead) line = String(cfg.readLabel || t('readLabel')).replace(/\{minutes\}/g, String(minutes));
    rows.push({
      kind: 'ack',
      key: String(post.postId || post.id || ''),
      title: String(post.title || post.caption || post.name || '').trim() || t('untitled'),
      post,
      acknowledged: !!acknowledged,
      due,
      minutes,
      line,
    });
  });
  const tasks = sectionList(cfg.tasks, ['title', 'note', 'linkUrl', 'dueDate']).filter((task) => task.title);
  tasks.forEach((task) => {
    const key = taskKey(task.title);
    if (done && done[key] && !(justDone && justDone[key])) return;
    const due = parseDay(task.dueDate);
    rows.push({
      kind: 'task',
      key,
      title: task.title,
      url: task.linkUrl,
      acknowledged: false,
      due,
      minutes: 0,
      line: task.note || (due ? t('taskBy', { date: fmtDay(due) }) : ''),
    });
  });
  if (showDue || tasks.length) {
    const FAR = 8640000000000000;
    rows.sort((a, b) => (a.due ? a.due.getTime() : FAR) - (b.due ? b.due.getTime() : FAR));
  }
  // limit: rows wanted (How many, or every row up to 50 once Show more is open).
  const max = Math.min(50, Math.max(1, Number(cfg.limit != null ? cfg.limit : cfg.maxItems) || 5));
  return rows.slice(0, max);
};

/** How many rows to show: maxItems, or up to 50 behind Show more. */
export const clampItems = (v) => Math.min(50, Math.max(1, Math.round(Number(v)) || 5));
