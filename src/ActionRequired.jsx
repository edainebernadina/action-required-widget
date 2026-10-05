import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  bool,
  buildRows,
  doneFromPrefs,
  filterPending,
  filterSpacePages,
  mergePrefsBag,
  taskKey,
} from './logic';

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
  if (raw === 'event') return 'post';
  return 'post';
};

const buildDefaultConsoleUrl = (origin, item) => {
  const id = item?.id || item?.postId;
  if (!origin || !id) return '';
  const t = contentRouteType(item);
  if (t === 'page') return `${origin}/console/#!/browse/page/${id}`;
  if (t === 'story') return `${origin}/console/#!/browse/story/${id}`;
  return `${origin}/console/#!/browse/post/${id}`;
};

const applyUrlTemplate = (template, { postId, origin, type }) =>
  template
    .replaceAll('{postId}', encodeURIComponent(postId || ''))
    .replaceAll('{origin}', origin || '')
    .replaceAll('{type}', type || '');

const resolveActionUrl = (item, config) => {
  const explicit =
    item?.acknowledgmentUrl ||
    item?.actionUrl ||
    item?.url ||
    item?.deepLink ||
    item?.link;
  if (explicit && typeof explicit === 'string') return explicit;

  const postId = item?.id || item?.postId;
  const origin = getConsoleOrigin();
  const type = contentRouteType(item);

  if (config.acknowledgeUrlTemplate?.trim()) {
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
  return variation?.value ?? field.value ?? fallback;
};

const fieldValue = (field, fallback) => {
  if (field && typeof field === 'object' && !Array.isArray(field) && 'value' in field) {
    return field.value == null ? fallback : field.value;
  }
  return fallback;
};

/* Defaults equal Action Required 1.1.2: every pending item tenant-wide, cards with a button. */
const defaultConfig = {
  buttonLabel: 'Read and acknowledge',
  maxItems: 5,
  acknowledgeUrlTemplate: '',
  layout: 'cards',
  scope: 'pending',
  spaceId: '',
  tag: '',
  showCompleted: false,
  showReadTime: false,
  readLabel: 'Read, {minutes} min',
  wordsPerMinute: 200,
  showDueDates: false,
  dueLabel: 'Read and acknowledge by {date}',
  dueTagPrefix: 'due-',
  acknowledgedLabel: 'Acknowledged',
  subtitle: '',
  tasks: [],
  emptyText: 'You have no items that require acknowledgment.',
  debugMode: false,
};

const TEXT_FIELDS = [
  'buttonLabel', 'acknowledgeUrlTemplate', 'readLabel', 'dueLabel', 'acknowledgedLabel', 'subtitle', 'emptyText',
];

const isSchemaNotReadyError = (err) => {
  const msg = err?.message || String(err);
  return /appspaceApis|schema does not define/i.test(msg);
};

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

/** Number of rows visible before the list becomes scrollable */
const VISIBLE_ROW_CAP = 4;
const MAX_PENDING_PAGES = 10;

const getListRowGapPx = (n) => {
  if (n < 2) return 16;
  if (n === 2) return 14;
  if (n === 3) return 8;
  if (n === 4) return 5;
  return 4;
};

const getBodyInnerGapPx = (n) => {
  if (n < 2) return 8;
  if (n < 3) return 6;
  return 4;
};

const getCompactThumb = (n) => n >= 4;

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

const ActionRequired = () => {
  const [themeReady, setThemeReady] = useState(false);
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState([]);
  const [done, setDone] = useState({});
  const [justDone, setJustDone] = useState({});
  const [noSpace, setNoSpace] = useState(false);
  const [, setTraceTick] = useState(0);

  const isMountedRef = useRef(false);
  const hasLoadedDataRef = useRef(false);
  const hasCalledReadyRef = useRef(false);
  const containerRef = useRef(null);
  const listScrollRef = useRef(null);
  const schemaRetryCountRef = useRef(0);
  const retryingSchemaRef = useRef(false);
  const prefsOkRef = useRef(false);
  const doneRef = useRef({});
  const traceRef = useRef({ apiVersion: '', calls: [], notes: [], error: '' });

  const items = buildRows(content, config, done, justDone);
  const isList = config.layout === 'list';

  const callApi = useCallback(async (name, params) => {
    const api = getWidgetApi();
    const entry = { api: name, params: params || null, ok: null };
    traceRef.current.calls.push(entry);
    try {
      const res = await api.callAppspaceAPI(name, params ? { params } : undefined);
      entry.ok = true;
      return res;
    } catch (err) {
      entry.ok = false;
      entry.status = statusOf(err);
      entry.error = String(err?.message || err);
      throw err;
    }
  }, []);

  const checkAndCallReady = useCallback(async () => {
    if (isMountedRef.current && hasLoadedDataRef.current && !hasCalledReadyRef.current) {
      const api = getWidgetApi();
      if (api) {
        try {
          await api.onReady();
          hasCalledReadyRef.current = true;
        } catch (err) {
          console.error('[ActionRequired] onReady failed:', err);
        }
      }
    }
  }, []);

  const remeasureScrollCap = useCallback(() => {
    const wrap = listScrollRef.current;
    if (!wrap) return;
    if (items.length > VISIBLE_ROW_CAP) {
      const first = wrap.querySelector('.ack-row');
      if (first) {
        const rowH = first.getBoundingClientRect().height;
        if (rowH < 1) return;
        const g = getListRowGapPx(Math.min(10, Math.max(items.length, 2)));
        const maxH = VISIBLE_ROW_CAP * rowH + (VISIBLE_ROW_CAP - 1) * g;
        wrap.style.setProperty('--ack-scroll-max', `${Math.ceil(maxH)}px`);
      }
    } else {
      wrap.style.removeProperty('--ack-scroll-max');
    }
  }, [items.length]);

  /* Scope "pending": every item waiting for the viewer's acknowledgment (1.1.2 data). */
  const fetchPending = useCallback(async (cfg) => {
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

    return filterPending(all, cfg).map((post) => ({ post, acknowledged: false }));
  }, [callApi]);

  /* Scope "space": the pages of one space carrying the tag, each with the viewer's acknowledgment. */
  const fetchSpace = useCallback(async (cfg) => {
    const spaceId = String(cfg.spaceId || '').trim();
    const tag = String(cfg.tag || '').trim();
    if (!spaceId) return { content: [], noSpace: true };
    const res = tag
      ? await callApi('getTaggedPages', { spaceId, tag })
      : await callApi('getSpacePages', { spaceId });
    let pages = filterSpacePages(extractItems(unwrap(res)), cfg);
    const cap = Math.min(50, Math.max(1, Number(cfg.maxItems) || 5));
    if (bool(cfg.showCompleted)) pages = pages.slice(0, cap);
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
    return { content: pages.map((post, i) => ({ post, acknowledged: flags[i] })), noSpace: false };
  }, [callApi]);

  /* Tasks: ticked-off state lives in the viewer's preferences (key waitingForYou), localStorage as fallback. */
  const loadDone = useCallback(async (cfg, storeKey) => {
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

  const fetchAcknowledgmentsOnce = useCallback(async (cfg) => {
    const api = getWidgetApi();
    if (!api?.callAppspaceAPI) {
      throw new Error('Appspace API is not available in this context.');
    }

    const hasTasks = buildRows([], { ...cfg, maxItems: 50 }, {}, {}).length > 0;
    const storeKey = taskKey(JSON.stringify(cfg.tasks || '') + cfg.spaceId);
    const tasksPromise = hasTasks ? loadDone(cfg, storeKey) : Promise.resolve();

    let rows = [];
    let failure = null;
    try {
      if (cfg.scope === 'space') {
        const r = await fetchSpace(cfg);
        rows = r.content;
        setNoSpace(r.noSpace);
      } else {
        rows = await fetchPending(cfg);
      }
    } catch (err) {
      failure = err;
    }
    await tasksPromise;
    if (failure && (!hasTasks || isSchemaNotReadyError(failure))) throw failure;
    if (failure) {
      traceRef.current.error = String(failure?.message || failure);
      setError(failure?.message || String(failure));
    }
    setContent(rows);

    const shown = buildRows(rows, cfg, doneRef.current, {}).length;
    if (api.raiseAnalyticsEvent) {
      api.raiseAnalyticsEvent('widgetLoaded', { itemCount: String(shown) }).catch(() => {});
    }
  }, [fetchPending, fetchSpace, loadDone]);

  const fetchData = useCallback(
    async (cfg) => {
      try {
        setLoading(true);
        setError(null);
        retryingSchemaRef.current = false;

        await fetchAcknowledgmentsOnce(cfg);
        schemaRetryCountRef.current = 0;

        if (!hasLoadedDataRef.current) {
          hasLoadedDataRef.current = true;
          checkAndCallReady();
        }
      } catch (err) {
        if (isSchemaNotReadyError(err) && schemaRetryCountRef.current < 8) {
          schemaRetryCountRef.current += 1;
          retryingSchemaRef.current = true;
          const delay = 300 + schemaRetryCountRef.current * 350;
          setTimeout(() => {
            if (isMountedRef.current) fetchData(cfg);
          }, delay);
          return;
        }

        console.error('[ActionRequired] Fetch error:', err);
        traceRef.current.error = String(err?.message || err);
        setError(err?.message || String(err));
        if (!hasLoadedDataRef.current) {
          hasLoadedDataRef.current = true;
          checkAndCallReady();
        }
      } finally {
        if (!retryingSchemaRef.current) {
          setLoading(false);
        }
      }
    },
    [fetchAcknowledgmentsOnce, checkAndCallReady]
  );

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    const load = async () => {
      const api = getWidgetApi();

      try {
        traceRef.current.apiVersion = (api?.getInfo && api.getInfo()?.version) || 'unknown';
      } catch {
        traceRef.current.apiVersion = 'getInfo failed';
      }

      if (api?.onLoading) {
        try {
          await api.onLoading();
        } catch (err) {
          console.warn('[ActionRequired] onLoading failed:', err);
        }
      }

      if (api && typeof api.getTheme === 'function') {
        try {
          const theme = await api.getTheme();
          if (!cancelled) {
            api.applyThemeToDocument(theme);
          }
        } catch (err) {
          console.warn('[ActionRequired] Theme fetch failed:', err);
        }
      }
      if (!cancelled) {
        setThemeReady(true);
      }

      let effectiveConfig = { ...defaultConfig };
      if (api) {
        try {
          const widgetConfig = await api.getConfiguration();
          const cfg = widgetConfig?.data?.configuration || {};
          const lang = widgetConfig?.data?.languageKey || 'en';
          const next = { ...effectiveConfig };
          Object.keys(defaultConfig).forEach((k) => {
            next[k] = TEXT_FIELDS.includes(k)
              ? localized(cfg[k], defaultConfig[k], lang)
              : fieldValue(cfg[k], defaultConfig[k]);
          });
          next.maxItems = cfg.maxItems?.value != null ? Number(cfg.maxItems.value) : defaultConfig.maxItems;
          next.layout = next.layout === 'list' ? 'list' : 'cards';
          next.scope = next.scope === 'space' ? 'space' : 'pending';
          effectiveConfig = next;
          setConfig(effectiveConfig);
        } catch (e) {
          console.error('[ActionRequired] getConfiguration failed:', e);
        }
      }

      await fetchData(effectiveConfig);

      if (api?.onLoaded) {
        try {
          await api.onLoaded();
        } catch (err) {
          console.warn('[ActionRequired] onLoaded failed:', err);
        }
      }
    };

    load();

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
        api.onDestroy().catch(() => {});
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useLayoutEffect(() => {
    remeasureScrollCap();
  }, [items.length, loading, error, config.buttonLabel, remeasureScrollCap]);

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => remeasureScrollCap());
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, remeasureScrollCap]);

  const navigateTo = (href, target) => {
    const api = getWidgetApi();
    if (api?.navigate) {
      api.navigate(href, target).catch(() => {
        window.open(href, '_blank', 'noopener,noreferrer');
      });
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const openAcknowledgment = (item) => {
    const href = resolveActionUrl(item, config);
    if (!href) return;

    const api = getWidgetApi();
    if (api?.raiseAnalyticsEvent) {
      const postId = String(item?.id || item?.postId || '');
      api.raiseAnalyticsEvent('acknowledgmentOpened', { postId }).catch(() => {});
    }
    navigateTo(href, isList ? '_self' : '_blank');
  };

  /* Same-tenant links route inside the app; anything else opens a new tab. */
  const openTask = (row) => {
    let u = String(row.url || '').trim();
    if (!u) return;
    const api = getWidgetApi();
    if (api?.raiseAnalyticsEvent) {
      api.raiseAnalyticsEvent('taskOpened', { task: String(row.title) }).catch(() => {});
    }
    if (/^mailto:|^tel:/i.test(u)) {
      window.open(u, '_top');
      return;
    }
    const origin = getConsoleOrigin();
    const internal = u.charAt(0) === '#' || u.charAt(0) === '/' || (origin && u.indexOf(origin) === 0);
    if (u.charAt(0) === '#' || u.charAt(0) === '/') u = origin + (u.charAt(0) === '#' ? '/console/' : '') + u;
    navigateTo(u, internal ? '_self' : '_blank');
  };

  const markDone = async (row) => {
    const stamp = new Date().toISOString();
    const nextDone = { ...doneRef.current, [row.key]: stamp };
    doneRef.current = nextDone;
    setDone(nextDone);
    setJustDone((j) => ({ ...j, [row.key]: true }));
    const api = getWidgetApi();
    if (api?.raiseAnalyticsEvent) {
      api.raiseAnalyticsEvent('taskDone', { task: String(row.title) }).catch(() => {});
    }
    saveLocal(taskKey(JSON.stringify(config.tasks || '') + config.spaceId), nextDone);
    if (!prefsOkRef.current) return;
    try {
      // PATCH replaces the whole bag: re-read right before writing and keep every other key.
      const res = await callApi('getPrefs');
      await callApi('savePrefs', { additionalProperties: mergePrefsBag(unwrap(res) || {}, nextDone) });
    } catch {
      /* the local copy still holds it */
    } finally {
      setTraceTick((t) => t + 1);
    }
  };

  const debugPanel = () => {
    if (!bool(config.debugMode)) return null;
    const dump = {
      widgetApi: traceRef.current.apiVersion,
      origin: getConsoleOrigin(),
      config,
      rows: items.map((r) => ({ kind: r.kind, key: r.key, title: r.title, acknowledged: r.acknowledged, line: r.line })),
      done,
      prefsOk: prefsOkRef.current,
      notes: traceRef.current.notes,
      calls: traceRef.current.calls,
      error: traceRef.current.error || undefined,
    };
    return (
      <details className="ar-debug" open>
        <summary>Diagnostic mode</summary>
        <pre>{JSON.stringify(dump, null, 2)}</pre>
      </details>
    );
  };

  if (!themeReady) {
    return null;
  }

  if (isList) {
    let note = null;
    if (!items.length && !loading) {
      if (error) note = 'Your list could not be loaded right now. Please try again later.';
      else if (noSpace) note = 'Set the Space ID in the widget settings.';
      else note = config.emptyText;
    }
    return (
      <div className="ar">
        {config.subtitle ? <p className="ar-subtitle">{config.subtitle}</p> : null}
        {items.length > 0 && (
          <ul className="ar-list" aria-label="Acknowledgment items">
            {items.map((row) => {
              const isDone = row.kind === 'task' && justDone[row.key];
              const href = row.kind === 'task' ? row.url : resolveActionUrl(row.post, config);
              // A page waiting for the viewer with no due date or read time says what to do (Waiting for you 1.0.0).
              const line = row.line || (row.kind === 'ack' && !row.acknowledged ? config.buttonLabel : '');
              return (
                <li
                  key={row.kind + row.key}
                  className={['ar-row', row.acknowledged && 'is-ack', isDone && 'is-done'].filter(Boolean).join(' ')}
                >
                  <a
                    className="ar-main"
                    href="#"
                    aria-disabled={href ? undefined : 'true'}
                    onClick={(e) => {
                      e.preventDefault();
                      if (row.kind === 'task') openTask(row);
                      else openAcknowledgment(row.post);
                    }}
                  >
                    <span className="ar-title">{row.title}</span>
                    {isDone ? <span className="ar-line">Done</span> : line ? <span className="ar-line">{line}</span> : null}
                  </a>
                  {row.kind === 'task' && !isDone ? (
                    <button type="button" className="ar-done" onClick={() => markDone(row)}>Done</button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {note ? <p className="ar-note">{note}</p> : null}
        {debugPanel()}
      </div>
    );
  }

  const n = items.length;
  const listRowGap = getListRowGapPx(n);
  const bodyInnerGap = getBodyInnerGapPx(n);
  const compactThumb = getCompactThumb(n);
  const isScroll = n > VISIBLE_ROW_CAP;
  const listLayoutClass = isScroll
    ? 'ack-list--stacked'
    : n === 1
      ? 'ack-list--distribute ack-list--distribute--single'
      : 'ack-list--distribute';

  return (
    <div className="widget-container" ref={containerRef}>
      <div
        className={[
          'widget-card',
          n >= 2 && 'widget-card--medium',
          n >= 4 && 'widget-card--dense',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {config.subtitle ? <p className="ack-subtitle">{config.subtitle}</p> : null}

        {loading && (
          <div className="widget-state widget-state--loading" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Loading…</span>
          </div>
        )}

        {!loading && error && items.length === 0 && (
          <div className="widget-state widget-state--error" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="widget-empty">{noSpace ? 'Set the Space ID in the widget settings.' : config.emptyText}</p>
        )}

        {!loading && items.length > 0 && (
          <div
            ref={listScrollRef}
            className={[
              'ack-list-outer',
              isScroll && 'ack-list-outer--scroll',
              !isScroll && 'ack-list-outer--fill',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <ul
              className={['ack-list', listLayoutClass].filter(Boolean).join(' ')}
              aria-label="Acknowledgment items"
              style={{
                ...(isScroll ? { ['--ack-list-gap']: `${listRowGap}px` } : {}),
                ['--ack-body-inner-gap']: `${bodyInnerGap}px`,
              }}
            >
              {items.map((row) => {
                const raw = row.post || {};
                const key = row.kind === 'task'
                  ? 'task-' + row.key
                  : raw.id || raw.postId || JSON.stringify(raw).slice(0, 40);
                const title = row.title;
                const img = row.kind === 'task' ? null : pickCoverUrl(raw);
                const isDone = row.kind === 'task' && justDone[row.key];
                const meta = isDone ? 'Done' : row.acknowledged ? '' : row.line;
                const btnClass = ['ack-btn', compactThumb && 'ack-btn--tight'].filter(Boolean).join(' ');
                return (
                  <li key={key} className="ack-row">
                    <div className="ack-thumb-wrap">
                      {img ? (
                        <img className="ack-thumb" src={img} alt="" loading="lazy" />
                      ) : (
                        <div className="ack-thumb ack-thumb--placeholder" aria-hidden="true" />
                      )}
                    </div>
                    <div className="ack-body">
                      <p className="ack-title">{title}</p>
                      {meta ? <p className="ack-meta">{meta}</p> : null}
                      {row.kind === 'task' ? (
                        !isDone && (
                          <span className="ack-actions">
                            <button type="button" className={btnClass} onClick={() => markDone(row)}>Done</button>
                            {row.url ? (
                              <button type="button" className="ack-link" onClick={() => openTask(row)}>Open</button>
                            ) : null}
                          </span>
                        )
                      ) : row.acknowledged ? (
                        <button type="button" className="ack-link" onClick={() => openAcknowledgment(raw)}>
                          {config.acknowledgedLabel}
                        </button>
                      ) : (
                        <button type="button" className={btnClass} onClick={() => openAcknowledgment(raw)}>
                          {config.buttonLabel}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {debugPanel()}
      </div>
    </div>
  );
};

export default ActionRequired;
