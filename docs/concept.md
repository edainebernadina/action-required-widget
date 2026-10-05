# Concept: Action Required

_One page. For design and product to react to._
_Status: draft for design review (filled in as built, version 3.0.0, 5 October 2026)_

## The idea

- **Job:** shows each person what they still have to read and acknowledge, and any one-off tasks, where they already land, with one tap to open each item.
- **For:** every employee who has read-and-acknowledge items; a Space can also use it as a fixed reading list.
- **Where:** Home and Spaces (also communities, topics and channels).
- **Picker category:** News & feeds.
- **Closest product widget today:** none on a page; the list lives in the Action Required area of the user profile, which people have to go and open. This adds that list on a page, a per-Space reading list with progress, due dates and tasks.
- **Starts from Cosmos pattern:** Featured Posts (Cards) and Top Pages (List) with a row action; use case family: Spaces and lists.

## Data and permissions

| Call | Service / path | As the viewer? | Admin or editor sees | Employee sees | No access sees |
|---|---|---|---|---|---|
| getMyAcknowledgmentPosts | `contentfeed/posts/acknowledgment/me` | Yes | Own pending items | Own pending items | Nothing pending: positive line |
| getTaggedPages / getSpacePages | `contentfeed/posts?feedIds=` | Yes | Pages of the Space | Pages they may read | Editor note on 401 or 403, otherwise hidden |
| getPostAcknowledgment | `contentfeed/posts/{id}?IncludeCurrentUserAcknowledgment=true` | Yes | Own acknowledgment | Own acknowledgment | Counts as not acknowledged |
| getPrefs / savePrefs | `userpreference/users/me` | Yes | Own ticked-off tasks | Own ticked-off tasks | Own |

No admin accounts, shared logins, passports or secrets.

## States x sizes

Layout variants: Cards, List. Each gets its own 16 cells.

| State | Narrow (Mobile 343, Small 327) | Medium (630) | Large (1024) |
|---|---|---|---|
| Default | Cards: picture, title, line, button under them. List: title over line, Done right | Cards: one row, button in a fixed right column. List: fixed columns title, line, Done | Same, larger picture, wider columns |
| Placeholder | Static dashed bars in the layout's shape, aria-hidden | Same in columns | Same |
| Loading | The placeholder shape, pulsing, aria-busy | Same | Same |
| Empty | Illustration and "You have no items that require acknowledgment." (positive) | Same | Same, larger illustration |

## Empty and error copy

| Case | Editors see | End users see |
|---|---|---|
| Not set up yet (Pages of chosen Spaces, no Space; or only Current Space; or only All Spaces in that scope) | Pick a Space, with the reason | Hidden |
| Nothing to show right now (no matching pages in the Space) | Nothing to list here. No published pages in this Space carry the tag ... | Hidden |
| Nothing waiting for the viewer | The Nothing waiting text | The same: positive empty, because for a to-do list "nothing waiting" is the answer |
| No access | Hidden for people who cannot read this Space. | Hidden |
| Error | Couldn't load. Try again. plus the detail, Try again | Couldn't load. Try again. with Try again |

## Settings

| Group | Setting (label) | Control | Default |
|---|---|---|---|
| Content | What to list | Dropdown: Waiting for me, Pages of chosen Spaces or topics | Waiting for me |
| Content | Spaces or topics | `feedPicker` (All Spaces = every Space; Current Space cannot be resolved, editors are told) | empty = every Space |
| Content | Only with this tag | Text | empty |
| Content | Keep acknowledged pages in the list | Boolean (Pages of chosen Spaces) | off |
| Content | Tasks | Sections: title, line, link, due date | none |
| Display | Layout | Dropdown: Cards, List | Cards |
| Display | How many / Show more | Number 1 to 50 / switch | 5 / off |
| Display | Show read time, Reading speed | Boolean, number | off, 200 |
| Display | Show due dates, Due date tag prefix | Boolean, text | off, `due-` |
| Wording | Line at the top, Button, Read time, Due date, Acknowledged, Nothing waiting | Translatable text | blank = standard wording |
| Advanced | Open links in | Dropdown: Automatic, New tab, Same tab | Automatic |
| Advanced | Link address | Text with `{postId}`, `{origin}`, `{type}` | blank |
| Advanced | Diagnostic mode | Boolean (kept during this build phase at the owner's request) | off |

No Visibility group: what each person sees is decided by the platform's own acknowledgment data.

## Cosmos components

| Part of the widget | Cosmos component or token |
|---|---|
| Item row (Cards) | Featured Posts row: picture (`pageComponentBrand` radius), title, caption |
| Item row (List) | `Table` row, `neutral200` divider, tabular dates |
| Read and acknowledge | `Button` primary, `brand1`, `buttonBrand` radius |
| Done, Show more, Try again | `Button` secondary |
| Acknowledged, Open | Text button, `neutral600` |
| Empty and nothing waiting | `EmptyStateWidget` with a stand-in illustration |
| Loading and placeholder | `Skeleton` |

## Open questions for design

- Is "nothing waiting" right as a positive empty for everyone, or should it hide like other empties (the page then jumps once you are done)?
- The Cards look keeps four rows visible and scrolls the rest when Show more is off (the 1.1.2 behaviour). Should Show more replace the inner scroll for good?
- Open links in has a third option, Automatic, so existing placements keep Cards in a new tab and List in the same tab. Keep it, or settle on one default?
- Items open the Console browse route; should they open the Intranet article instead?
- Due dates come from a `due-YYYY-MM-DD` tag because Appspace has no acknowledgment due date. Acceptable until the product has one?
- Should the picker's Current Space be resolvable for custom widgets (the host does not pass the Space it sits on)?
- The illustration is a stand-in for the Cosmos `content1` illustration.
