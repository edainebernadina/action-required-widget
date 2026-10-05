/* Harness scenes. makeScene(name, F) gets the loaded fixtures:
   F.pending     real contentfeed/posts/acknowledgment/me (17 items, from Must Reads)
   F.spacePages  real contentfeed/posts?feedIds=<Onboarding site> (12 pages, from Must Reads)
   F.postAck     real contentfeed/posts/{id}?IncludeCurrentUserAcknowledgment=true (from Must Reads)
   F.wfy         pending items with due- tags (from Waiting for you)
   F.live        real People Hub pending + prefs + its 1.0.0 config (from Waiting for you) */
(function () {
  var ONBOARDING = '8aebbd86-a771-4a48-ab4a-97a636d93738';
  var PEOPLEHUB = 'd78a3fdd-4f89-428c-b65f-cabfc3013434';
  var DONE2 = ['538997c0-74bb-497c-96bc-f26d89dd3aba', 'e955346e-9391-4e3b-8275-d316e2074f58'];
  var TASKS = [{ title: 'Confirm your emergency contact', note: 'Takes one minute', linkUrl: '', dueDate: '2026-10-16' }];
  var PREFS = { defaultLanguage: 'en', additionalProperties: { digest: { seenIds: ['a', 'b'] } } };

  // 1.1.2 placements only carry these three keys.
  var V112 = { buttonLabel: 'Read and acknowledge', maxItems: 5, acknowledgeUrlTemplate: '' };
  var MUST = { layout: 'list', scope: 'space', spaceId: ONBOARDING, tag: 'must-read', showCompleted: true, showReadTime: true,
    maxItems: 5, subtitle: 'Five pages every new joiner reads and acknowledges', emptyText: 'Nothing to read here yet.' };
  var WAIT = { layout: 'list', scope: 'pending', spaceId: PEOPLEHUB, showDueDates: true, tasks: TASKS, maxItems: 5, emptyText: 'You are all caught up.' };

  function merge(a, b) { var o = {}; [a, b].forEach(function (x) { Object.keys(x || {}).forEach(function (k) { o[k] = x[k]; }); }); return o; }
  function page(list) { return function (p) { var s = Number(p.start) || 0; var l = Number(p.limit) || 50; return { items: list.slice(s, s + l) }; }; }
  function pendingOf(F, n) { return page(F.pending.items.slice(0, n == null ? F.pending.items.length : n)); }
  function spaceApi(F, done, opts) {
    opts = opts || {};
    return {
      getTaggedPages: opts.fail ? { __status: 500 } : function (p) {
        var items = F.spacePages.items;
        if (!opts.ignored) items = items.filter(function (x) { return (x.tags || []).indexOf(p.tag) !== -1; });
        return { items: items };
      },
      getSpacePages: F.spacePages,
      getPostAcknowledgment: opts.nogrant ? { __status: 403 } : function (p) {
        var post = JSON.parse(JSON.stringify(F.postAck));
        post.id = p.postId;
        post.userAcknowledgment = (done || []).indexOf(p.postId) !== -1 ? { isAcknowledged: true, acknowledgedAt: '2026-10-01T09:00:00Z' } : null;
        return post;
      }
    };
  }
  function waitApi(F, prefs, pending) { return { getMyAcknowledgmentPosts: page(pending || F.wfy.items), getPrefs: prefs || PREFS, savePrefs: {} }; }

  window.makeScene = function (name, F) {
    var S = {
      // ---- 1.1.2 parity (also run against ?build=baseline) ----
      cards: { config: V112, api: { getMyAcknowledgmentPosts: pendingOf(F) } },
      'cards-3': { config: V112, api: { getMyAcknowledgmentPosts: pendingOf(F, 3) } },
      'cards-1': { config: V112, api: { getMyAcknowledgmentPosts: pendingOf(F, 1) } },
      'cards-empty': { config: V112, api: { getMyAcknowledgmentPosts: { items: [] } } },
      'cards-error': { config: V112, api: { getMyAcknowledgmentPosts: { __status: 500 } } },
      'cards-label': { config: { buttonLabel: 'Review now', maxItems: 2, acknowledgeUrlTemplate: '{origin}/x/{type}/{postId}' }, api: { getMyAcknowledgmentPosts: pendingOf(F) } },
      // ---- Must reads (Onboarding site) ----
      must: { config: merge(MUST, {}), api: spaceApi(F, []) },
      'must-two': { config: MUST, api: spaceApi(F, DONE2) },
      'must-ignored': { config: MUST, api: spaceApi(F, DONE2, { ignored: true }) },
      'must-pending-only': { config: merge(MUST, { showCompleted: false }), api: spaceApi(F, DONE2) },
      'must-all-pages': { config: merge(MUST, { tag: '', maxItems: 8 }), api: spaceApi(F, DONE2) },
      'must-unknown-tag': { config: merge(MUST, { tag: 'nothing' }), api: spaceApi(F, []) },
      'must-nospace': { config: merge(MUST, { spaceId: '' }), api: spaceApi(F, []) },
      'must-500': { config: MUST, api: spaceApi(F, [], { fail: true }) },
      'must-nogrant': { config: MUST, api: spaceApi(F, DONE2, { nogrant: true }) },
      // ---- Waiting for you (People Hub) ----
      wait: { config: WAIT, api: waitApi(F) },
      'wait-all': { config: merge(WAIT, { spaceId: '', maxItems: 6 }), api: waitApi(F) },
      'wait-done': { config: WAIT, api: waitApi(F, { additionalProperties: { waitingForYou: { done: { tl54tic: 'x' } } } }) },
      'wait-empty': { config: merge(WAIT, { tasks: [] }), api: waitApi(F, PREFS, []) },
      'wait-fail': { config: merge(WAIT, { tasks: [] }), api: { getMyAcknowledgmentPosts: { __status: 500 }, getPrefs: { __status: 403 } } },
      'wait-fail-tasks': { config: WAIT, api: { getMyAcknowledgmentPosts: { __status: 500 }, getPrefs: PREFS, savePrefs: {} } },
      'wait-opaque': { config: WAIT, api: {}, opaque: true },
      'wait-live': { config: merge(WAIT, {}), api: waitApi(F, F.live.prefs, F.live.pending.items) },
      // ---- the new settings on the cards look ----
      'cards-mixed': { config: merge(V112, { showDueDates: true, showReadTime: true, tasks: TASKS, spaceId: PEOPLEHUB, subtitle: 'Before Friday' }), api: waitApi(F) },
      'cards-space': { config: merge(MUST, { layout: 'cards' }), api: spaceApi(F, DONE2) }
    };
    return S[name] || S.cards;
  };
})();
