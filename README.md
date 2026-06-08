# Action Required Widget

Appspace custom widget that lists posts the signed-in user must read and acknowledge—the same data shown in the profile Action Required experience.

## Features

- Loads pending acknowledgment posts via the Appspace `getMyAcknowledgmentPosts` API
- Configurable title, button label, and maximum items
- Optional acknowledge URL template with `{postId}`, `{origin}`, and `{type}` placeholders
- Scrollable list (up to four rows visible at once)
- Tenant branding via Appspace `getTheme()` (colors, fonts, radii)
- Analytics events for widget load and acknowledgment opens

## Quick start

```bash
npm install
npm run build
```

Upload `dist/widget-action-required-1.0.11.zip` to Appspace Console as a custom widget template.

## Local development

```bash
npm run dev
```

Webpack dev server serves the widget with hot reload.

## Project structure

```
src/
  ActionRequired.jsx   # Widget UI and API integration
  main.jsx             # React entry point
  index.css            # Cosmos-aligned styles
widget.html            # Widget shell (production)
schema.json            # Admin configuration panel
images/                # Widget icon
scripts/package.js     # Zip packaging for Appspace upload
webpack.config.js
```

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `widgetTitle` | `Action Required` | Heading above the list |
| `buttonLabel` | `Read and acknowledge` | Primary action label on each row |
| `maxItems` | `50` | Maximum posts to load (1–50) |
| `acknowledgeUrlTemplate` | _(empty)_ | Optional URL override; blank uses console deep links |

## Template key

`widget-action-required-v1`
