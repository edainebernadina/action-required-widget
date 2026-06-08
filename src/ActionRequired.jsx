import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

const normalizeTitle = (item) =>
  (item?.title || item?.caption || item?.name || 'Untitled').toString().trim() || 'Untitled';

const extractItems = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  return [];
};

const defaultConfig = {
  widgetTitle: 'Action Required',
  buttonLabel: 'Read and acknowledge',
  maxItems: 50,
  acknowledgeUrlTemplate: '',
};

const isSchemaNotReadyError = (err) => {
  const msg = err?.message || String(err);
  return /appspaceApis|schema does not define/i.test(msg);
};

/** Number of rows visible before the list becomes scrollable */
const VISIBLE_ROW_CAP = 4;

/**
 * Tighter `gap` between list rows as more items load, so the block uses the ~250px host slot
 * more evenly without a dead band of empty space.
 */
const getListRowGapPx = (n) => {
  if (n < 2) return 16;
  if (n === 2) return 14;
  if (n === 3) return 8;
  if (n === 4) return 5;
  return 4; // 5+ (scroll) — same rule as 4+ rows, tightest
};

const getBodyInnerGapPx = (n) => {
  if (n < 2) return 8;
  if (n < 3) return 6;
  return 4; // 3+ — between title and button
};

const getCompactThumb = (n) => n >= 4;


/**
 * Appspace host wraps custom widgets in a node with `min-height: 250px` (styled-components
 * in the console). A smaller `setHeight` + inline `height` loses to that min, which leaves
 * a visible band. We call `setHeight` with at least this value so the iframe height the host
 * applies matches the slot, and the iframe is filled (see `index.css` page tone below the card).
 */
const HOST_IFRAME_MIN_HEIGHT_PX = 250;

const ActionRequired = () => {
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);

  const isMountedRef = useRef(false);
  const hasLoadedDataRef = useRef(false);
  const hasCalledReadyRef = useRef(false);
  const containerRef = useRef(null);
  const listScrollRef = useRef(null);
  const schemaRetryCountRef = useRef(0);
  const retryingSchemaRef = useRef(false);

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

  const updateHeight = useCallback(() => {
    const api = getWidgetApi();
    const el = containerRef.current;
    if (!el || !api?.setHeight) return;
    // Use the larger of layout box and scrollable overflow (avoids under-reporting when flex used to clip)
    const contentPx = Math.max(
      el.offsetHeight,
      el.scrollHeight,
      el.getBoundingClientRect().height
    );
    const target = Math.max(Math.ceil(contentPx), HOST_IFRAME_MIN_HEIGHT_PX);
    api.setHeight(target).catch(() => {});
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

  const fetchAcknowledgmentsOnce = useCallback(async (cfg) => {
    const api = getWidgetApi();
    if (!api?.callAppspaceAPI) {
      throw new Error('Appspace API is not available in this context.');
    }

    const pageSize = 50;
    let all = [];
    let start = 0;

    while (true) {
      const res = await api.callAppspaceAPI('getMyAcknowledgmentPosts', {
        params: { limit: String(pageSize), start: String(start) },
      });
      const batch = extractItems(res?.data);
      all = all.concat(batch);
      if (batch.length === 0 || batch.length < pageSize) break;
      start += batch.length;
    }

    const cap = Math.min(50, Math.max(1, Number(cfg.maxItems) || 50));
    setItems(all.slice(0, cap));

    if (api.raiseAnalyticsEvent) {
      api
        .raiseAnalyticsEvent('widgetLoaded', { itemCount: String(Math.min(all.length, cap)) })
        .catch(() => {});
    }
  }, []);

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

    const load = async () => {
      let effectiveConfig = { ...defaultConfig };
      const api = getWidgetApi();
      if (api) {
        try {
          const widgetConfig = await api.getConfiguration();
          const cfg = widgetConfig?.data?.configuration || {};
          effectiveConfig = {
            ...effectiveConfig,
            widgetTitle: cfg.widgetTitle?.value ?? effectiveConfig.widgetTitle,
            buttonLabel: cfg.buttonLabel?.value ?? effectiveConfig.buttonLabel,
            maxItems: cfg.maxItems?.value != null ? Number(cfg.maxItems.value) : effectiveConfig.maxItems,
            acknowledgeUrlTemplate:
              cfg.acknowledgeUrlTemplate?.value ?? effectiveConfig.acknowledgeUrlTemplate,
          };
          setConfig(effectiveConfig);
        } catch (e) {
          console.error('[ActionRequired] getConfiguration failed:', e);
        }
      }
      await fetchData(effectiveConfig);
    };

    load();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- single bootstrap after mount (matches praise-leaderboard)
  }, []);

  useLayoutEffect(() => {
    remeasureScrollCap();
    const id = requestAnimationFrame(() => updateHeight());
    return () => cancelAnimationFrame(id);
  }, [items, loading, error, config.widgetTitle, config.buttonLabel, remeasureScrollCap, updateHeight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const onResize = () => {
      remeasureScrollCap();
      updateHeight();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    onResize();
    return () => ro.disconnect();
  }, [remeasureScrollCap, updateHeight]);

  const openAcknowledgment = (item) => {
    const href = resolveActionUrl(item, config);
    if (!href) return;

    const api = getWidgetApi();
    if (api?.raiseAnalyticsEvent) {
      const postId = String(item?.id || item?.postId || '');
      api.raiseAnalyticsEvent('acknowledgmentOpened', { postId }).catch(() => {});
    }

    if (api?.navigate) {
      api.navigate(href, '_blank').catch(() => {
        window.open(href, '_blank', 'noopener,noreferrer');
      });
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

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
      <h2 className="widget-title">{config.widgetTitle}</h2>
      <div
        className={[
          'widget-card',
          n >= 2 && 'widget-card--medium',
          n >= 4 && 'widget-card--dense',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {loading && (
          <div className="widget-state widget-state--loading" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Loading…</span>
          </div>
        )}

        {!loading && error && (
          <div className="widget-state widget-state--error" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="widget-empty">You have no items that require acknowledgment.</p>
        )}

        {!loading && !error && items.length > 0 && (
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
                // Stacked 5+ only: gap shrinks with count. Distribute 1–4: no row gap; flex spreads rows.
                ...(isScroll ? { ['--ack-list-gap']: `${listRowGap}px` } : {}),
                ['--ack-body-inner-gap']: `${bodyInnerGap}px`,
              }}
            >
              {items.map((raw) => {
                const key = raw.id || raw.postId || JSON.stringify(raw).slice(0, 40);
                const title = normalizeTitle(raw);
                const img = pickCoverUrl(raw);
                return (
                  <li
                    key={key}
                    className="ack-row"
                  >
                    <div className="ack-thumb-wrap">
                      {img ? (
                        <img className="ack-thumb" src={img} alt="" loading="lazy" />
                      ) : (
                        <div className="ack-thumb ack-thumb--placeholder" aria-hidden="true" />
                      )}
                    </div>
                    <div className="ack-body">
                      <p className="ack-title">{title}</p>
                      <button
                        type="button"
                        className={['ack-btn', compactThumb && 'ack-btn--tight'].filter(Boolean).join(' ')}
                        onClick={() => openAcknowledgment(raw)}
                      >
                        {config.buttonLabel}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionRequired;
