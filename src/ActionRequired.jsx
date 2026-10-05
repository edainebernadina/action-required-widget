/*
 * Action Required, built to the product widget standard (Widget Lab states,
 * width bands, empty rule, strings file, Cosmos tokens, Diagnostic mode).
 *
 * Lifecycle: waitForWidgetApi (main.jsx) -> onLoading -> getConfiguration ->
 * theme -> skeleton -> data as the viewer -> render -> onReady. onReady runs
 * exactly once, on the error path too, and straight away for the placeholder.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  bool,
  buildRows,
  clampItems,
  doneFromPrefs,
  filterPending,
  filterSpacePages,
  idList,
  spaceSelection,
  mergePrefsBag,
  taskKey,
} from './logic';
import { pickStrings, t } from './strings';

const TAG = '[ActionRequired]';
const DEBUG_KEY = 'ar:debug';

// PENDING DESIGN CONFIRMATION: product-standard.md B2. The layout follows the
// widget's own width in three bands; these two numbers are the only place the
// breakpoints live.
export const BREAKPOINTS = { medium: 480, large: 800 };

// PENDING DESIGN CONFIRMATION: product-standard.md B3. End users see nothing
// for "not set up", "nothing in this Space" and "no access". The one positive
// empty is "nothing waiting for you": for a to-do list that IS the answer, and
// a widget that vanishes once you are done would look broken.
const POSITIVE_EMPTY_WHEN_CAUGHT_UP = true;

const getWidgetApi = () => window.appspace?.widgetApi;

const getConsoleOrigin = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('consoleUrl');
    if (url) {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    /* ignore */
  }
  try {
    if (document.referrer) {
      return new URL(document.referrer).origin;
    }
  } catch {
    /* ignore */
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
};

const pickCoverUrl = (item) => {
  const c = item?.cover || item?.banner || item?.thumbnail;
  if (c?.workspaceUrl) return c.workspaceUrl;
  if (c?.contentUrl) return c.contentUrl;
  const att = Array.isArray(item?.attachments) ? item.attachments[0] : null;
  if (att?.workspaceUrl) return att.workspaceUrl;
  if (att?.contentUrl) return att.contentUrl;
  return null;
};

const contentRouteType = (item) => {
  const raw = (item?.type || item?.postType || item?.contentType || '').toString().toLowerCase();
  if (raw === 'page') return 'page';
  if (raw === 'story') return 'story';
  return 'post';
};

const buildDefaultConsoleUrl = (origin, item) => {
  const id = item?.id || item?.postId;
  if (!origin || !id) return '';
  const type = contentRouteType(item);
  if (type === 'page') return `${origin}/console/#!/browse/page/${id}`;
  if (type === 'story') return `${origin}/console/#!/browse/story/${id}`;
  return `${origin}/console/#!/browse/post/${id}`;
};

const applyUrlTemplate = (template, { postId, origin, type }) =>
  template
    .replaceAll('{postId}', encodeURIComponent(postId || ''))
    .replaceAll('{origin}', origin || '')
    .replaceAll('{type}', type || '');

const resolveActionUrl = (item, config) => {
  if (!item) return '';
  const explicit = item.acknowledgmentUrl || item.actionUrl || item.url || item.deepLink || item.link;
  if (explicit && typeof explicit === 'string') return explicit;
  const postId = item.id || item.postId;
  const origin = getConsoleOrigin();
  const type = contentRouteType(item);
  if (String(config.acknowledgeUrlTemplate || '').trim()) {
    return applyUrlTemplate(config.acknowledgeUrlTemplate.trim(), { postId, origin, type });
  }
  return buildDefaultConsoleUrl(origin, item);
};

/** Accepts {data: {items}}, {data: {data: {...}}}, an array, or the body itself. */
const unwrap = (response) => {
  let payload = response && response.data != null ? response.data : response;
  if (payload && payload.data != null && payload.id == null && payload.items == null) payload = payload.data;
  return payload;
};

const extractItems = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  return [];
};

const localized = (field, fallback, lang) => {
  if (!field) return fallback;
  const variation = field.variations?.find((v) => v.lang === lang);
  const value = variation?.value ?? field.value;
  return value == null ? fallback : value;
};

const fieldValue = (field, fallback) => {
  if (field && typeof field === 'object' && !Array.isArray(field) && 'value' in field) {
    return field.value == null ? fallback : field.value;
  }
  return fallback;
};

/*
 * Defaults for every schema field. Behaviour equals 1.1.2 (every pending item,
 * cards with a button). Wording fields are blank: blank means "use strings.js",
 * which is translated.
 */
const defaultConfig = {
  scope: 'pending',
  spaceId: [],
  tag: '',
  showCompleted: false,
  tasks: [],
  layout: 'cards',
  maxItems: 5,
  showMore: false,
  showReadTime: false,
  wordsPerMinute: 200,
  showDueDates: false,
  dueTagPrefix: 'due-',
  subtitle: '',
  buttonLabel: '',
  readLabel: '',
  dueLabel: '',
  acknowledgedLabel: '',
  emptyText: '',
  linkTarget: 'auto',
  acknowledgeUrlTemplate: '',
  debugMode: false,
};

const TEXT_FIELDS = ['subtitle', 'buttonLabel', 'readLabel', 'dueLabel', 'acknowledgedLabel', 'emptyText', 'acknowledgeUrlTemplate'];
const WORDING = ['buttonLabel', 'readLabel', 'dueLabel', 'acknowledgedLabel', 'emptyText'];

const isSchemaNotReadyError = (err) => /appspaceApis|schema does not define/i.test(err?.message || String(err));

const statusOf = (error) => {
  if (!error || typeof error === 'string') return 0;
  const c = [error.status, error.statusCode, error.response?.status, error.data?.status, error.error?.status];
  for (let i = 0; i < c.length; i += 1) {
    const v = Number(c[i]);
    if (v >= 100 && v < 600) return v;
  }
  const m = /\b(4\d{2}|5\d{2})\b/.exec(String(error.message || ''));
  return m ? Number(m[1]) : 0;
};

const errorText = (error) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  const status = statusOf(error);
  return [status ? `HTTP ${status}` : '', error.message ? String(error.message) : ''].filter(Boolean).join(' ') || String(error);
};

const errorShape = (error) => {
  if (!error || typeof error !== 'object') return error;
  const shape = {};
  Object.getOwnPropertyNames(error).forEach((key) => {
    try { shape[key] = key === 'stack' ? undefined : error[key]; } catch { shape[key] = '(unreadable)'; }
  });
  return shape;
};

const debugFromStorage = () => {
  try {
    return window.localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
};

/** Rows visible in the cards look before the list scrolls (when Show more is off). */
const VISIBLE_ROW_CAP = 4;
const MAX_PENDING_PAGES = 10;

const bandFor = (width) => {
  if (width >= BREAKPOINTS.large) return 'large';
  if (width >= BREAKPOINTS.medium) return 'medium';
  return 'narrow';
};

const localDone = (key) => {
  try {
    return JSON.parse(localStorage.getItem('wfy:' + key) || '{}') || {};
  } catch {
    return {};
  }
};

const saveLocal = (key, done) => {
  try {
    localStorage.setItem('wfy:' + key, JSON.stringify(done));
  } catch {
    /* private mode */
  }
};

/* Stand-in for the Cosmos empty-state illustration (content1), on theme tokens. */
const EmptyArt = () => (
  <svg className="ar-empty-art" viewBox="0 0 120 88" aria-hidden="true" focusable="false">
    <rect x="22" y="10" width="62" height="72" rx="8" className="ar-art-sheet" />
    <rect x="32" y="24" width="34" height="6" rx="3" className="ar-art-line" />
    <rect x="32" y="38" width="42" height="6" rx="3" className="ar-art-line" />
    <rect x="32" y="52" width="26" height="6" rx="3" className="ar-art-line" />
    <circle cx="86" cy="62" r="16" className="ar-art-badge" />
    <path d="M79 62.5l5 5 9-10" className="ar-art-tick" />
  </svg>
);

const ActionRequired = () => {
  const [config, setConfig] = useState(null);
  const [view, setView] = useState('loading'); // placeholder | loading | ready | error
  const [content, setContent] = useState([]);
  const [emptyKind, setEmptyKind] = useState(''); // setup | nothing | caughtup
  const [failure, setFailure] = useState(null); // { text, status, noAccess }
  const [done, setDone] = useState({});
  const [justDone, setJustDone] = useState({});
  const [expanded, setExpanded] = useState(false);
  const [host, setHost] = useState({ isEditor: false, debug: false, isPlaceholder: false });
  const [, setTraceTick] = useState(0);

  const isMountedRef = useRef(false);
  const hasCalledReadyRef = useRef(false);
  const listScrollRef = useRef(null);
  const moreRef = useRef(null);
  const schemaRetryCountRef = useRef(0);
  const prefsOkRef = useRef(false);
  const doneRef = useRef({});
  const bandRef = useRef('');
  const traceRef = useRef({ apiVersion: '', locale: 'en', calls: [], notes: [], error: '', errorShape: null });

  const cfg = config || defaultConfig;
  const isList = cfg.layout === 'list';
  const word = (key) => String(cfg[key] || '').trim() || t(key);
  const rowCfg = { ...cfg, acknowledgedLabel: word('acknowledgedLabel'), dueLabel: word('dueLabel'), readLabel: word('readLabel') };
  const maxItems = clampItems(cfg.maxItems);
  const allRows = buildRows(content, { ...rowCfg, limit: 50 }, done, justDone);
  const showMoreOn = bool(cfg.showMore);
  const items = showMoreOn && expanded ? allRows : allRows.slice(0, maxItems);
  const hasMore = showMoreOn && allRows.length > maxItems;

  const callApi = useCallback(async (name, params) => {
    const api = getWidgetApi();
    const entry = { api: name, params: params || null, ok: null };
    traceRef.current.calls.push(entry);
    try {
      const res = await Promise.resolve(api.callAppspaceAPI(name, params ? { params } : undefined));
      entry.ok = true;
      return res;
    } catch (err) {
      entry.ok = false;
      entry.status = statusOf(err);
      entry.error = String(err?.message || err);
      throw err;
    }
  }, []);

  const callReady = useCallback(async () => {
    if (hasCalledReadyRef.current) return;
    hasCalledReadyRef.current = true;
    const api = getWidgetApi();
    if (!api || typeof api.onReady !== 'function') return;
    try {
      await api.onReady();
    } catch (err) {
      console.error(TAG, 'onReady failed:', err);
    }
  }, []);

  /* Width bands: a body class, changed only when the band changes (autoHeight fires resize on every content change). */
  useEffect(() => {
    const update = () => {
      const width = document.documentElement.clientWidth || window.innerWidth || 0;
      const band = bandFor(width);
      if (band === bandRef.current) return;
      if (bandRef.current) document.body.classList.remove('ar-' + bandRef.current);
      document.body.classList.add('ar-' + band);
      bandRef.current = band;
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(document.documentElement);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  /* Scope "pending": every item waiting for the viewer's acknowledgment (1.1.2 data). */
  const fetchPending = useCallback(async (c) => {
    const sel = spaceSelection(c.spaceId);
    // Only the "Current Space" token: a custom widget cannot resolve it.
    if (sel.unresolved.length && !sel.ids.length && !sel.all) return { content: [], setup: 'current', matched: 0 };
    const pageSize = 50;
    let all = [];
    let start = 0;
    let firstId = null;
    for (let page = 0; page < MAX_PENDING_PAGES; page += 1) {
      const res = await callApi('getMyAcknowledgmentPosts', { limit: String(pageSize), start: String(start) });
      const batch = extractItems(unwrap(res));
      if (batch.length === 0) break;
      const id = batch[0]?.id || batch[0]?.postId;
      if (page > 0 && id && id === firstId) break; // host ignored start: stop rather than loop
      if (page === 0) firstId = id;
      all = all.concat(batch);
      if (batch.length < pageSize) break;
      start += batch.length;
    }
    return { content: filterPending(all, c).map((post) => ({ post, acknowledged: false })), setup: '', matched: -1 };
  }, [callApi]);

  /* Scope "space": the pages of the picked Spaces carrying the tag, each with the viewer's acknowledgment. */
  const fetchSpace = useCallback(async (c) => {
    const sel = spaceSelection(c.spaceId);
    const ids = sel.ids;
    const tag = String(c.tag || '').trim();
    if (!ids.length) {
      // Nothing picked, only "Current Space" (unresolvable here), or "All Spaces" (no one listing covers every Space).
      return { content: [], setup: sel.unresolved.length ? 'current' : (sel.all ? 'all' : 'none'), matched: 0 };
    }
    let listed = [];
    const seen = {};
    for (let i = 0; i < ids.length; i += 1) {
      const res = tag
        ? await callApi('getTaggedPages', { spaceId: ids[i], tag })
        : await callApi('getSpacePages', { spaceId: ids[i] });
      extractItems(unwrap(res)).forEach((p) => {
        const key = p && (p.id || p.postId);
        if (key && seen[key]) return;
        if (key) seen[key] = true;
        listed.push(p);
      });
    }
    let pages = filterSpacePages(listed, c);
    const matched = pages.length;
    if (bool(c.showCompleted)) pages = pages.slice(0, bool(c.showMore) ? 50 : clampItems(c.maxItems));
    const flags = await Promise.all(pages.map(async (p) => {
      if (!(p.acknowledgment && p.acknowledgment.isEnabled)) return false;
      try {
        const r = await callApi('getPostAcknowledgment', { postId: p.id });
        return !!((unwrap(r) || {}).userAcknowledgment || {}).isAcknowledged;
      } catch (e) {
        traceRef.current.notes.push(`acknowledgment of ${p.id} unreadable (${statusOf(e) || 'no status'})`);
        return false;
      }
    }));
    return { content: pages.map((post, i) => ({ post, acknowledged: flags[i] })), setup: '', matched };
  }, [callApi]);

  /* Tasks: ticked-off state lives in the viewer's preferences (key waitingForYou), localStorage as fallback. */
  const loadDone = useCallback(async (storeKey) => {
    const merged = { ...localDone(storeKey) };
    try {
      const res = await callApi('getPrefs');
      const { ok, done: fromPrefs } = doneFromPrefs(unwrap(res) || {});
      prefsOkRef.current = ok;
      Object.keys(fromPrefs).forEach((k) => { merged[k] = fromPrefs[k]; });
    } catch {
      prefsOkRef.current = false;
    }
    doneRef.current = merged;
    setDone(merged);
  }, [callApi]);

  const storeKeyFor = (c) => taskKey(JSON.stringify(c.tasks || '') + idList(c.spaceId).join(','));

  const fetchData = useCallback(async (c) => {
    setView('loading');
    setFailure(null);
    traceRef.current.error = '';
    traceRef.current.errorShape = null;
    try {
      const api = getWidgetApi();
      if (!api?.callAppspaceAPI) throw new Error('Appspace API is not available in this context.');
      const hasTasks = buildRows([], { ...c, limit: 50 }, {}, {}).length > 0;
      const tasksPromise = hasTasks ? loadDone(storeKeyFor(c)) : Promise.resolve();
      let result = { content: [], setup: '', matched: -1 };
      let failed = null;
      try {
        result = c.scope === 'space' ? await fetchSpace(c) : await fetchPending(c);
      } catch (err) {
        failed = err;
      }
      await tasksPromise;
      if (failed && (!hasTasks || isSchemaNotReadyError(failed))) throw failed;
      if (failed) {
        // The tasks still show; the content failure is in the diagnostic panel.
        traceRef.current.error = errorText(failed);
        traceRef.current.errorShape = errorShape(failed);
      }
      const shown = buildRows(result.content, { ...c, limit: 50 }, doneRef.current, {});
      let kind = '';
      if (!shown.length) {
        if (result.setup) kind = 'setup-' + result.setup;
        else if (result.matched === 0) kind = 'nothing';
        else kind = 'caughtup';
      }
      schemaRetryCountRef.current = 0;
      setContent(result.content);
      setEmptyKind(kind);
      setView('ready');
      if (api.raiseAnalyticsEvent) {
        Promise.resolve(api.raiseAnalyticsEvent('widgetLoaded', { itemCount: String(Math.min(shown.length, clampItems(c.maxItems))) })).catch(() => {});
      }
      callReady();
    } catch (err) {
      if (isSchemaNotReadyError(err) && schemaRetryCountRef.current < 8) {
        schemaRetryCountRef.current += 1;
        const delay = 300 + schemaRetryCountRef.current * 350;
        setTimeout(() => { if (isMountedRef.current) fetchData(c); }, delay);
        return;
      }
      const status = statusOf(err);
      console.error(TAG, 'failed to load:', err);
      traceRef.current.error = errorText(err);
      traceRef.current.errorShape = errorShape(err);
      setFailure({ text: errorText(err), status, noAccess: status === 401 || status === 403 });
      setView('error');
      callReady();
    }
  }, [fetchPending, fetchSpace, loadDone, callReady]);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    const start = async () => {
      const api = getWidgetApi();
      try {
        traceRef.current.apiVersion = (api?.getInfo && api.getInfo()?.version) || 'unknown';
      } catch {
        traceRef.current.apiVersion = 'getInfo failed';
      }
      if (api?.onLoading) {
        try { await api.onLoading(); } catch (err) { console.warn(TAG, 'onLoading failed:', err); }
      }

      let effective = { ...defaultConfig };
      let data = {};
      try {
        const widgetConfig = await api.getConfiguration();
        data = widgetConfig?.data || {};
        const fields = data.configuration || {};
        const lang = data.languageKey || 'en';
        traceRef.current.locale = pickStrings(lang);
        Object.keys(defaultConfig).forEach((k) => {
          effective[k] = TEXT_FIELDS.includes(k) ? localized(fields[k], defaultConfig[k], lang) : fieldValue(fields[k], defaultConfig[k]);
        });
        WORDING.concat(['subtitle']).forEach((k) => { effective[k] = String(effective[k] == null ? '' : effective[k]); });
        effective.maxItems = clampItems(effective.maxItems);
        effective.layout = effective.layout === 'list' ? 'list' : 'cards';
        effective.scope = effective.scope === 'space' ? 'space' : 'pending';
        effective.linkTarget = ['_blank', '_self'].includes(effective.linkTarget) ? effective.linkTarget : 'auto';
        traceRef.current.configLoaded = true;
      } catch (e) {
        console.error(TAG, 'getConfiguration failed:', e);
      }

      // The theme is always applied: a product widget has no theme toggle.
      if (api && typeof api.getTheme === 'function') {
        try {
          const theme = await api.getTheme();
          if (!cancelled && theme && typeof api.applyThemeToDocument === 'function') api.applyThemeToDocument(theme);
        } catch (err) {
          console.warn(TAG, 'no host theme, using Cosmos defaults:', err);
        }
      }
      if (cancelled) return;

      // The custom widget host sends no editor or placeholder flag today; the
      // harness does, and on a tenant Diagnostic mode shows the editor views.
      const harness = data.harness || {};
      const debug = harness.debug === true || bool(effective.debugMode) || debugFromStorage();
      const nextHost = { isPlaceholder: data.isPlaceholder === true, debug, isEditor: harness.role === 'editor' || debug };
      setHost(nextHost);
      setConfig(effective);
      document.body.classList.remove('is-hidden');

      if (nextHost.isPlaceholder) {
        // Placeholder: data free, no network calls.
        setView('placeholder');
        callReady();
        return;
      }
      await fetchData(effective);
      if (api?.onLoaded) {
        try { await api.onLoaded(); } catch (err) { console.warn(TAG, 'onLoaded failed:', err); }
      }
    };

    start().catch((err) => {
      console.error(TAG, 'failed to start:', err);
      traceRef.current.error = errorText(err);
      traceRef.current.errorShape = errorShape(err);
      setConfig((c) => c || { ...defaultConfig });
      setFailure({ text: errorText(err), status: statusOf(err), noAccess: false });
      setView('error');
      callReady();
    });

    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- single bootstrap after mount
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      const api = getWidgetApi();
      if (api?.onDestroy) {
        try { Promise.resolve(api.onDestroy()).catch(() => {}); } catch { /* closing anyway */ }
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  /* Cards look with Show more off: four rows visible, the rest scroll inside the list (as in 1.1.2). */
  const remeasureScrollCap = useCallback(() => {
    const wrap = listScrollRef.current;
    if (!wrap) return;
    if (!showMoreOn && items.length > VISIBLE_ROW_CAP) {
      const rows = wrap.querySelectorAll('.ar-card');
      if (rows.length > VISIBLE_ROW_CAP) {
        const top = rows[0].getBoundingClientRect().top;
        const cut = rows[VISIBLE_ROW_CAP].getBoundingClientRect().top;
        if (cut - top > 1) wrap.style.setProperty('--ar-scroll-max', `${Math.ceil(cut - top - 12)}px`);
      }
    } else {
      wrap.style.removeProperty('--ar-scroll-max');
    }
  }, [items.length, showMoreOn]);

  useLayoutEffect(() => { remeasureScrollCap(); }, [items.length, view, remeasureScrollCap]);

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => remeasureScrollCap());
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, view, remeasureScrollCap]);

  const navigateTo = (href, target) => {
    const api = getWidgetApi();
    if (api?.navigate) {
      Promise.resolve(api.navigate(href, target)).catch(() => {
        window.open(href, '_blank', 'noopener,noreferrer');
      });
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  /* Open links in: Automatic keeps the 1.1.2 and 2.0.0 behaviour (cards: new tab, list: same tab). */
  const contentTarget = () => {
    if (cfg.linkTarget === '_blank' || cfg.linkTarget === '_self') return cfg.linkTarget;
    return isList ? '_self' : '_blank';
  };

  const openAcknowledgment = (item) => {
    const href = resolveActionUrl(item, cfg);
    if (!href) return;
    const api = getWidgetApi();
    if (api?.raiseAnalyticsEvent) {
      Promise.resolve(api.raiseAnalyticsEvent('acknowledgmentOpened', { postId: String(item?.id || item?.postId || '') })).catch(() => {});
    }
    navigateTo(href, contentTarget());
  };

  const taskHref = (row) => {
    const u = String(row.url || '').trim();
    if (!u) return '';
    if (u.charAt(0) === '#' || u.charAt(0) === '/') return getConsoleOrigin() + (u.charAt(0) === '#' ? '/console/' : '') + u;
    return u;
  };

  /* Same-tenant links route inside the app; anything else opens a new tab. */
  const openTask = (row) => {
    const raw = String(row.url || '').trim();
    if (!raw) return;
    const api = getWidgetApi();
    if (api?.raiseAnalyticsEvent) {
      Promise.resolve(api.raiseAnalyticsEvent('taskOpened', { task: String(row.title) })).catch(() => {});
    }
    if (/^mailto:|^tel:/i.test(raw)) {
      window.open(raw, '_top');
      return;
    }
    const origin = getConsoleOrigin();
    const internal = raw.charAt(0) === '#' || raw.charAt(0) === '/' || (origin && raw.indexOf(origin) === 0);
    navigateTo(taskHref(row), internal ? (cfg.linkTarget === '_blank' ? '_blank' : '_self') : '_blank');
  };

  const markDone = async (row) => {
    const stamp = new Date().toISOString();
    const nextDone = { ...doneRef.current, [row.key]: stamp };
    doneRef.current = nextDone;
    setDone(nextDone);
    setJustDone((j) => ({ ...j, [row.key]: true }));
    const api = getWidgetApi();
    if (api?.raiseAnalyticsEvent) {
      Promise.resolve(api.raiseAnalyticsEvent('taskDone', { task: String(row.title) })).catch(() => {});
    }
    saveLocal(storeKeyFor(cfg), nextDone);
    if (!prefsOkRef.current) return;
    try {
      // PATCH replaces the whole bag: re-read right before writing and keep every other key.
      const res = await callApi('getPrefs');
      await callApi('savePrefs', { additionalProperties: mergePrefsBag(unwrap(res) || {}, nextDone) });
    } catch {
      /* the local copy still holds it */
    } finally {
      setTraceTick((n) => n + 1);
    }
  };

  const toggleMore = () => {
    setExpanded((e) => !e);
    setTimeout(() => { if (moreRef.current) moreRef.current.focus(); }, 0);
  };

  const retry = () => {
    if (config) fetchData(config);
    else window.location.reload();
  };

  // ---------------------------------------------------------------- render

  const debugPanel = () => {
    if (!host.debug) return null;
    const dump = {
      widgetApi: traceRef.current.apiVersion,
      configLoaded: !!traceRef.current.configLoaded,
      locale: traceRef.current.locale,
      origin: getConsoleOrigin(),
      band: bandRef.current,
      view,
      emptyKind: emptyKind || undefined,
      host,
      config: cfg,
      spaces: spaceSelection(cfg.spaceId),
      rows: items.map((r) => ({ kind: r.kind, key: r.key, title: r.title, acknowledged: r.acknowledged, line: r.line })),
      done,
      prefsOk: prefsOkRef.current,
      notes: traceRef.current.notes,
      calls: traceRef.current.calls,
      error: traceRef.current.error || undefined,
      errorShape: traceRef.current.errorShape || undefined,
    };
    return (
      <details className="ar-debug" open>
        <summary>{t('diagnostics')}</summary>
        <pre>{JSON.stringify(dump, null, 2)}</pre>
      </details>
    );
  };

  const subtitle = String(cfg.subtitle || '').trim();

  /* Bars in the shape of the layout. Loading pulses; Placeholder is static and data free. */
  const shape = (kind) => {
    const count = Math.min(maxItems, 3);
    const rows = [];
    for (let i = 0; i < count; i += 1) {
      rows.push(isList ? (
        <li key={i} className="ar-row">
          <span className="ar-main"><span className="ar-bar is-title" /><span className="ar-bar is-text" /></span>
          <span className="ar-line"><span className="ar-bar is-text" /></span>
          <span className="ar-action">{i === count - 1 ? <span className="ar-bar is-button" /> : null}</span>
        </li>
      ) : (
        <li key={i} className="ar-card">
          <span className="ar-thumb ar-bar" />
          <span className="ar-card-text"><span className="ar-bar is-title" /><span className="ar-bar is-text" /></span>
          <span className="ar-card-action"><span className="ar-bar is-button" /></span>
        </li>
      ));
    }
    const list = <ul className={isList ? 'ar-list' : 'ar-cards'}>{rows}</ul>;
    if (kind === 'loading') {
      return (
        <section className={`ar-root ar-${cfg.layout} ar-skel`} aria-busy="true">
          <span className="ar-sr-only">{t('loadingLabel')}</span>
          <div aria-hidden="true">
            {subtitle ? <span className="ar-bar is-subtitle" /> : null}
            {list}
          </div>
        </section>
      );
    }
    return (
      <section className={`ar-root ar-${cfg.layout} ar-placeholder`} aria-hidden="true">
        {subtitle ? <span className="ar-bar is-subtitle" /> : null}
        {list}
        {showMoreOn ? <span className="ar-more ar-ghost">{word('showMore')}</span> : null}
      </section>
    );
  };

  const emptyView = (kind, noAccess) => {
    if (kind === 'caughtup' && POSITIVE_EMPTY_WHEN_CAUGHT_UP) {
      return (
        <section className={`ar-root ar-${cfg.layout}`}>
          {subtitle ? <p className="ar-subtitle">{subtitle}</p> : null}
          <div className="ar-empty is-positive" role="status">
            <EmptyArt />
            <p className="ar-empty-text">{word('emptyText')}</p>
          </div>
          {debugPanel()}
        </section>
      );
    }
    if (!host.isEditor) return debugPanel(); // hidden: autoHeight collapses the frame
    let title = '';
    let text = '';
    if (noAccess) text = t('noAccessText');
    else if (kind === 'setup-current') { title = t('setupTitle'); text = t('setupCurrentText'); }
    else if (kind === 'setup-all') { title = t('setupTitle'); text = t('setupAllText'); }
    else if (/^setup/.test(kind)) { title = t('setupTitle'); text = t('setupText'); }
    else {
      title = t('nothingTitle');
      text = String(cfg.tag || '').trim() ? t('nothingTagText', { tag: String(cfg.tag).trim() }) : t('nothingText');
    }
    return (
      <section className={`ar-root ar-${cfg.layout}`}>
        <div className="ar-empty">
          <EmptyArt />
          {title ? <p className="ar-empty-title">{title}</p> : null}
          <p className="ar-empty-text">{text}</p>
          <p className="ar-editor-note">{t('editorOnly')}</p>
        </div>
        {debugPanel()}
      </section>
    );
  };

  const moreButton = () => (hasMore ? (
    <button type="button" ref={moreRef} className="ar-more" aria-expanded={expanded ? 'true' : 'false'} onClick={toggleMore}>
      {expanded ? t('showLess') : word('showMore')}
    </button>
  ) : null);

  const renderList = () => (
    <section className="ar-root ar-list-look">
      {subtitle ? <p className="ar-subtitle">{subtitle}</p> : null}
      <ul className="ar-list" aria-label={t('listLabel')}>
        {items.map((row) => {
          const isDone = row.kind === 'task' && justDone[row.key];
          const href = row.kind === 'task' ? taskHref(row) : resolveActionUrl(row.post, cfg);
          // A page waiting for the viewer with no due date or read time says what to do (Waiting for you 1.0.0).
          const line = isDone ? t('done') : (row.line || (row.kind === 'ack' && !row.acknowledged ? word('buttonLabel') : ''));
          const newTab = row.kind === 'ack' && contentTarget() === '_blank';
          return (
            <li key={row.kind + row.key} className={['ar-row', row.acknowledged && 'is-ack', isDone && 'is-done'].filter(Boolean).join(' ')}>
              {href ? (
                <a
                  className="ar-main"
                  href={href}
                  target={newTab ? '_blank' : undefined}
                  rel={newTab ? 'noopener' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (row.kind === 'task') openTask(row);
                    else openAcknowledgment(row.post);
                  }}
                >
                  <span className="ar-title">{row.title}</span>
                  {newTab ? <span className="ar-sr-only"> {t('newTab')}</span> : null}
                </a>
              ) : (
                <span className="ar-main"><span className="ar-title">{row.title}</span></span>
              )}
              <span className="ar-line">{line}</span>
              <span className="ar-action">
                {row.kind === 'task' && !isDone ? (
                  <button type="button" className="ar-done" aria-label={t('markDone', { title: row.title })} onClick={() => markDone(row)}>{t('done')}</button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {moreButton()}
      {debugPanel()}
    </section>
  );

  const renderCards = () => {
    const isScroll = !showMoreOn && items.length > VISIBLE_ROW_CAP;
    return (
      <section className="ar-root ar-cards-look">
        {subtitle ? <p className="ar-subtitle">{subtitle}</p> : null}
        <div ref={listScrollRef} className={['ar-cards-outer', isScroll && 'is-scroll'].filter(Boolean).join(' ')}>
          <ul className="ar-cards" aria-label={t('listLabel')}>
            {items.map((row) => {
              const raw = row.post || {};
              const key = row.kind === 'task' ? 'task-' + row.key : raw.id || raw.postId || row.key;
              const img = row.kind === 'task' ? null : pickCoverUrl(raw);
              const isDone = row.kind === 'task' && justDone[row.key];
              const meta = isDone ? t('done') : row.acknowledged ? '' : row.line;
              return (
                <li key={key} className={['ar-card', isDone && 'is-done'].filter(Boolean).join(' ')}>
                  <span className="ar-thumb">
                    {img ? <img src={img} alt="" loading="lazy" /> : null}
                  </span>
                  <span className="ar-card-text">
                    <span className="ar-title">{row.title}</span>
                    {meta ? <span className="ar-line">{meta}</span> : null}
                  </span>
                  <span className="ar-card-action">
                    {row.kind === 'task' ? (
                      !isDone && (
                        <>
                          <button type="button" className="ar-button" aria-label={t('markDone', { title: row.title })} onClick={() => markDone(row)}>{t('done')}</button>
                          {row.url ? <button type="button" className="ar-link" onClick={() => openTask(row)}>{t('open')}</button> : null}
                        </>
                      )
                    ) : row.acknowledged ? (
                      <button type="button" className="ar-link" onClick={() => openAcknowledgment(raw)}>{word('acknowledgedLabel')}</button>
                    ) : (
                      <button type="button" className="ar-button" onClick={() => openAcknowledgment(raw)}>{word('buttonLabel')}</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        {moreButton()}
        {debugPanel()}
      </section>
    );
  };

  if (!config) return null;
  if (view === 'placeholder') return shape('placeholder');
  if (view === 'loading') return shape('loading');
  if (view === 'error') {
    if (failure && failure.noAccess) return emptyView('noaccess', true);
    return (
      <section className="ar-root" role="status">
        <p className="ar-error">{t('errorText')}</p>
        {host.isEditor && failure ? <p className="ar-error-detail">{t('errorEditorDetail', { detail: failure.text })}</p> : null}
        <button type="button" className="ar-more" onClick={retry}>{t('retry')}</button>
        {debugPanel()}
      </section>
    );
  }
  if (!items.length) return emptyView(emptyKind || 'caughtup', false);
  return isList ? renderList() : renderCards();
};

export default ActionRequired;
