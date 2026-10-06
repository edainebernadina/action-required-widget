# Action Required (widget-action-required-v1)

An Appspace custom widget that lists what the viewer still has to read and
acknowledge: everything waiting for them (the same data as the profile Action
Required area), or the pages of chosen Spaces with Acknowledged or a read time.
It can show due dates from a `due-` tag and add one-off tasks each viewer ticks
off with Done. Since 2.0.0 it also replaces Must Reads and Waiting for you.
Since 3.0.0 it is built to the product widget standard: the four Widget Lab
states at four sizes, standard settings groups, a Space picker, a strings
file, Cosmos tokens and the empty-state rule.

React 18 + webpack. The Widget API is loaded from the Console at runtime
(`widget.html` bootstrap), not bundled.

## How it decides

- **Waiting for me** (`scope: pending`, the default): pages through
  `contentfeed/posts/acknowledgment/me` (50 at a time, at most 10 pages), keeps
  only the picked Spaces and the tag when set, keeps the API order (by due date
  when due dates are on or tasks exist).
- **Pages of chosen Spaces** (`scope: space`): lists the published pages of each
  picked Space (optionally by tag), oldest first, and reads the viewer's
  acknowledgment per page. Acknowledged pages drop out, or stay with the
  Acknowledged text when Keep acknowledged pages is on.
- **Tasks**: up to eight, mixed in and sorted by due date. Done is kept in the
  viewer's own `userpreference/users/me` under
  `additionalProperties.waitingForYou.done` (same key and task ids as Waiting
  for you 1.0.0). PATCH replaces the whole bag, so the widget re-reads it right
  before writing and keeps every other key; localStorage (`wfy:<hash>`) is the
  fallback.

Widths (the widget's own width, `BREAKPOINTS` in `src/ActionRequired.jsx`):
narrow below 480 px, medium 480 to 799, large from 800.

| Layout | Narrow (343, 327) | Medium (630) | Large (1024) |
|---|---|---|---|
| Cards | Picture, title and line, the button under them | One row: picture, title and line, the button in a fixed right column | The same with a larger picture and a wider column |
| List | Title over its line, Done on the right | Fixed columns: title, line, Done | The same, wider line column |

## Settings

| Group | Setting | Default | What it decides |
|---|---|---|---|
| Content | What to list (`scope`) | Waiting for me | Waiting for me, or Pages of chosen Spaces. |
| Content | Spaces or topics (`spaceId`) | empty | Space picker (Spaces, Channels and topics). Pages of chosen Spaces: the ones listed. Waiting for me: optional filter; empty or All Spaces = every Space. A placement saved before 3.0.0 with one ID or a comma list of IDs still works. |
| Content | Only with this tag (`tag`) | empty | For example `must-read`. |
| Content | Keep acknowledged pages in the list (`showCompleted`) | off | Pages of chosen Spaces only. |
| Content | Tasks (`tasks`) | none | Title, line under it, link, due date (YYYY-MM-DD). Title and line are translatable. |
| Display | Layout (`layout`) | Cards | Cards or List. |
| Display | How many (`maxItems`) | 5 | 1 to 50, tasks included. |
| Display | Show more button (`showMore`) | off | Shows How many items and a button for the rest (up to 50). Off: Cards show four at once and scroll the rest, as before. |
| Display | Show read time (`showReadTime`), Reading speed (`wordsPerMinute`) | off, 200 | Read time from the page's word count. |
| Display | Show due dates (`showDueDates`), Due date tag prefix (`dueTagPrefix`) | off, `due-` | Due date from a `due-YYYY-MM-DD` tag; items sort by due date. |
| Wording | Line at the top (`subtitle`) | blank | Optional line above the list. |
| Wording | Button text, Read time text, Due date text, Acknowledged text, Nothing waiting text | blank | Translatable. Blank uses the standard wording in `src/strings.js`. `{minutes}` and `{date}` work as before. |
| Advanced | Open links in (`linkTarget`) | Automatic | Automatic: Cards open a new tab, List the same tab (the 2.0.0 behaviour). Or New tab, Same tab. |
| Advanced | Link address (`acknowledgeUrlTemplate`) | blank | Overrides the item link with `{postId}`, `{origin}`, `{type}`. |
| Advanced | Diagnostic mode (`debugMode`) | off | See below. |

No title setting: the placement's Widget title is host chrome. No colour,
theme, credential or height settings.

## APIs and permissions

Every call runs as the viewer through `callAppspaceAPI`: no passport, no
service account, no secrets.

| Name | Call | Used for |
|---|---|---|
| `getMyAcknowledgmentPosts` | `GET contentfeed/posts/acknowledgment/me?start=&limit=` | Waiting for me |
| `getTaggedPages`, `getSpacePages` | `GET contentfeed/posts?feedIds=<Space>&postTypes=Page[&tags=]&limit=100` | Pages of chosen Spaces (one call per Space) |
| `getPostAcknowledgment` | `GET contentfeed/posts/{id}?IncludeCurrentUserAcknowledgment=true` | Acknowledged or not, per page |
| `getPrefs`, `savePrefs` | `GET` / `PATCH userpreference/users/me` | Tasks ticked off |

Tenant-specific values: the Spaces picked, the tag, the task links. Only
people in a Space's publishing target get pending items, and authors never see
their own.

The checker flags `reactjs.org` in `widget.js`: that is the error-decoder link
inside React's own production build, a string in an error message. The widget
never calls or loads it.

## Empty states and errors

| Case | Editors see | Employees see |
|---|---|---|
| Nothing waiting for the viewer | Nothing waiting text, with the illustration | The same (positive empty) |
| Pages of chosen Spaces, no Space picked | "Pick a Space" | Nothing |
| The picker holds only Current Space (a widget cannot tell which Space it is on) | "Pick a Space", saying Current Space shows nothing | Nothing |
| Pages of chosen Spaces with only All Spaces picked (no listing covers every Space) | "Pick a Space", saying All Spaces cannot be listed | Nothing |
| The picked Spaces have no matching pages | "Nothing to list here" with the tag | Nothing |
| A read refused (401 or 403) | "Hidden for people who cannot read this Space." | Nothing |
| Any other failure | "Couldn't load. Try again." plus the detail, Try again | "Couldn't load. Try again.", Try again |

Nothing waiting is a positive empty on purpose: for a to-do list that is the
answer, and a widget that vanished once you were done would look broken. If
the content read fails but tasks are configured, the tasks still show and the
failure is in the diagnostic panel.

The custom widget host does not tell a widget whether the viewer can edit the
page, so on a tenant the editor views show only with Diagnostic mode on.

## Diagnostic mode

Turn on the Diagnostic mode setting (Advanced), or in DevTools select the widget
iframe as the console context, run `localStorage.setItem('ar:debug', '1')` and
reload (remove the key to turn it off). The panel shows the widget-api
version, the settings as read, the Space ids resolved from the stored value,
the rows, the task state, every call with its params and result, and the raw
error shape. It also switches on the editor views of the empty cases. In the
harness add `debug=1`.

## Build and test

```bash
npm install
npm test                 # logic unit tests (node, no browser)
npm run build            # webpack + dist/widget-action-required-<version>.zip
npm run serve            # harness on :4717
PLAYWRIGHT_CORE=<path to playwright-core> node test/check.mjs 4717 <outdir>
```

- `test/matrix.html`: the Widget Lab grid, Cards and List, 4 states x 4 sizes,
  as Editor, Employee or No access, with a choice of empty case.
- `test/frame.html?scene=<name>`: the scenes in `test/scenes.js` (fixtures from
  pre1, several of them real replies), plus `state=`, `role=`, `layout=`,
  `empty=`, `slow=1`, `fail=1`, `opaque=1`, `nogrant=1`, `theme=none`,
  `debug=1`, `click=<selector>`, `log=1`.
- `test/check.mjs`: every matrix cell and scene headless; checks onReady once,
  no console errors, no sideways scroll and what is on screen.

The zip holds `schema.json`, `widget.html`, `widget.js`, `widget.css`,
`widget.js.LICENSE.txt` and `images/`. Strings are bundled from
`src/strings.js`.

## Limits

- The list loads once per page view; after acknowledging, the row stays until
  the page is reloaded. The widget never acknowledges anything itself.
- Waiting for me cannot tell "all acknowledged" from "nothing was required".
- At most 50 rows; Waiting for me reads at most 10 pages of 50; Pages of chosen
  Spaces reads the first 100 pages per Space and makes one call per page that
  has acknowledgment enabled.
- Appspace has no acknowledgment due date, hence the tag convention. Dates show
  in the British day format (`dateLocale` in the strings).
- The picker's Current Space cannot be resolved by a custom widget, and All
  Spaces only works as "no filter" for Waiting for me.
- Tasks are identified by their title; renaming one brings it back for everyone.
- Only English strings ship today.
- The default link is the Console browse route; use Link address for another.

## Changelog

- 3.0.1 (2026-10-06): Empty, loading and placeholder views match the product's
  Widget Lab: the Cosmos illustration (tasks), the grey empty box, 96 / 280 px
  illustration sizes, the background-pulse skeleton and a 0.6 s fade-in.
- 3.0.0 (2026-10-05): product widget standard. `spaceId` is now a Space picker
  (old single ID, comma list and JSON values still read). Settings regrouped
  into Content, Display, Wording, Advanced; Wording fields translatable and
  blank by default (standard wording from `src/strings.js`). The picker's
  All Spaces value means every Space; its Current Space token is treated as
  not set up (editors are told). New `showMore`
  and `linkTarget` (Automatic keeps the old behaviour). Four Widget Lab states
  (placeholder, pulsing skeleton instead of a spinner, empty), width bands at
  480 and 800, the empty rule (editors see why, others see nothing; nothing
  waiting stays a positive line), quiet errors with Try again, no outer card,
  Cosmos tokens and brand button radius, `ar:debug` switch, `test/matrix.html`
  and `test/check.mjs`.
- 2.0.0 (2026-10-05): absorbs Must Reads and Waiting for you (scope, spaceId,
  tag, showCompleted, tasks, layout, read time, due dates, labels, debugMode).
- 1.1.2: pending items, button per row.

## Template key

`widget-action-required-v1` (keep it: an upload under another key creates a
second template).
