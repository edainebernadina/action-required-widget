# Action Required Widget

Appspace custom widget that lists posts the signed-in user must read and acknowledge—the same data shown in the profile Action Required experience.

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

Upload `dist/widget-action-required-1.1.2.zip` to Appspace Console as a custom widget template.

## Local development

```bash
npm run dev
```

Webpack dev server runs on `http://localhost:5173`. Load the widget inside Appspace Console (with `?consoleUrl=`) for full Widget API behavior.

## Project structure

```
src/
  ActionRequired.jsx   # Widget UI and API integration
  main.jsx             # Entry point (waits for Console-hosted Widget API)
  index.css            # Theme-aware styles
widget.html            # Widget shell with Widget API bootstrap
schema.json            # Admin configuration panel
images/                # Widget icon
scripts/package.js     # Zip packaging for Appspace upload
webpack.config.js
```

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `buttonLabel` | `Read and acknowledge` | Primary action label on each row |
| `maxItems` | `5` | Maximum posts to load (1–50) |
| `acknowledgeUrlTemplate` | _(empty)_ | Optional URL override; blank uses console deep links |

## Template key

`widget-action-required-v1`

## Compliance notes (1.13.2)

- Widget API is loaded from Console at runtime — not bundled via npm
- `supportedSpaceTypes`: homepage, community, topic, channel
- Height is managed by the host when `autoHeight: true` (no manual `setHeight()` in widget code)
