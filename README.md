# Action Required Widget

Appspace custom widget that lists what the signed-in user must read and acknowledge. By default it shows the same data as the profile Action Required experience. Since 2.0.0 it also replaces Must Reads (widget-must-reads) and Waiting for you (widget-waiting-for-you): one acknowledgment widget instead of three.

Built for **Appspace Widget API 1.13.2** (Console-hosted API, `autoHeight`, tenant theme inheritance).

## Features

- Loads pending acknowledgment posts via the Appspace `getMyAcknowledgmentPosts` API
- Configurable title, button label, and maximum items
- Optional acknowledge URL template with `{postId}`, `{origin}`, and `{type}` placeholders
- Scrollable list (up to four rows visible at once)
- Tenant branding via `getTheme()` / `applyThemeToDocument()` (`--nc-*` CSS variables)
- Automatic iframe sizing via `schema.ui.autoHeight`
- Analytics events for widget load and acknowledgment opens

## Quick start

```bash
npm install
npm run build
```

Upload `dist/widget-action-required-2.0.0.zip` to Appspace Console as a custom widget template.

## Local development

```bash
npm run dev
```

Webpack dev server runs on `http://localhost:5173`. Load the widget inside Appspace Console (with `?consoleUrl=`) for full Widget API behavior.

## Project structure

```
src/
  ActionRequired.jsx   # Widget UI and API integration
  logic.js             # Pure helpers: filters, read time, due tags, tasks, preference merge
  main.jsx             # Entry point (waits for Console-hosted Widget API)
  index.css            # Theme-aware styles
widget.html            # Widget shell with Widget API bootstrap
schema.json            # Admin configuration panel
images/                # Widget icon
scripts/package.js     # Zip packaging for Appspace upload
webpack.config.js
test/                  # Harness (frame.html, scenes.js, fixtures/), unit.mjs, shoot.mjs; not in the zip
```

## Configuration

Defaults equal 1.1.2, so a placement that only carries the three 1.1.2 keys renders exactly as before (checked pixel for pixel in the harness against the 1.1.2 build).

| Field | Default | Description |
|-------|---------|-------------|
| `scope` | `pending` | `pending`: everything waiting for the viewer's acknowledgment (`contentfeed/posts/acknowledgment/me`). `space`: the pages of one space, acknowledged or not (Must Reads). |
| `spaceId` | _(empty)_ | `space`: the space whose pages are listed. `pending`: optional filter, only items from these spaces (comma separated). |
| `tag` | _(empty)_ | Only items with this tag (for example `must-read`). |
| `showCompleted` | `false` | `space` only: keep acknowledged pages, labelled `acknowledgedLabel`. |
| `tasks` | `[]` | Sections (title, note, linkUrl, dueDate YYYY-MM-DD). Each viewer ticks a task off with Done. |
| `layout` | `cards` | `cards`: picture, title and button (1.1.2). `list`: title with a line under it, Done for tasks. |
| `subtitle` | _(empty)_ | Line at the top. |
| `buttonLabel` | `Read and acknowledge` | Button label (cards), or the line under a waiting page (list). |
| `showReadTime` | `false` | Read time from the page's word count (`captionContent`). |
| `readLabel` | `Read, {minutes} min` | |
| `wordsPerMinute` | `200` | 100 to 400. |
| `showDueDates` | `false` | Due date from a `due-YYYY-MM-DD` tag; items sort by due date. |
| `dueLabel` | `Read and acknowledge by {date}` | `{date}` is like Fri 9 Oct. |
| `dueTagPrefix` | `due-` | |
| `acknowledgedLabel` | `Acknowledged` | |
| `emptyText` | `You have no items that require acknowledgment.` | |
| `maxItems` | `5` | 1 to 50. |
| `acknowledgeUrlTemplate` | _(empty)_ | Optional URL override with `{postId}`, `{origin}`, `{type}`. |
| `debugMode` | `false` | Diagnostic panel: settings as read, rows, every API call. |

Tasks ticked off are kept in the viewer's own `userpreference/users/me` under `additionalProperties.waitingForYou.done` (same key and task ids as Waiting for you 1.0.0). PATCH replaces the whole bag, so the widget re-reads it right before writing and keeps every other key; localStorage (`wfy:<hash>`) is the fallback.

Order: `pending` keeps the API order (by due date when due dates are on or tasks exist); `space` lists oldest first.

Limits: Appspace has no acknowledgment due date, hence the tag convention. Only people in a space's publishing target get pending items, and authors never see their own. In `space` scope the acknowledgment is read per page (one call each).

## Test

```bash
npm test                      # logic ported from Must Reads and Waiting for you (node, no browser)
npm run serve                 # harness on :4871; BASELINE_DIR=<1.1.2 dist> serves an old build under /baseline/
PLAYWRIGHT_CORE=<path to playwright-core> node test/shoot.mjs 4871 <outdir> cards must wait 'cards::build=baseline'
```

Scenes (`test/scenes.js`, fixtures copied from both old widgets): cards, cards-3, cards-1, cards-empty, cards-error, cards-label (1.1.2 parity), must, must-two, must-ignored, must-pending-only, must-all-pages, must-unknown-tag, must-nospace, must-500, must-nogrant, wait, wait-all, wait-done, wait-empty, wait-fail, wait-fail-tasks, wait-opaque, wait-live, cards-mixed, cards-space. Add `click=.ar-done&log=1` to see the preference PATCH body.

## Changelog

- 2.0.0 (2026-10-05): absorbs Must Reads and Waiting for you. New settings scope, spaceId, tag, showCompleted, tasks, layout, subtitle, showReadTime, readLabel, wordsPerMinute, showDueDates, dueLabel, dueTagPrefix, acknowledgedLabel, emptyText, debugMode. Pending items now page through properly (start/limit placeholders). Zip no longer contains a copy of itself.
- 1.1.2: pending items, button per row.

## Template key

`widget-action-required-v1`

## Compliance notes (Widget API 1.13.2)

- Widget API is loaded from Console at runtime, not bundled via npm
- `supportedSpaceTypes`: homepage, community, topic, channel
- Height is managed by the host when `autoHeight: true` (no manual `setHeight()` in widget code)
