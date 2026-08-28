# Architecture

- `src/lib/settings.js`: default settings, feature flags, width normalization, merge helpers.
- `src/lib/parser.js`: RFC text parsing into semantic blocks (heading, paragraph, page break, pre/table).
- `src/lib/exporter.js`: HTML/Markdown export rendering.
- `src/extension/content-script.js`: page transformation, keyboard-accessible controls, persistence.
- `src/extension/background.js`: badge/error signaling.
- `src/extension/options.js`: global settings and feature flag editor.
- Toolbar icon click: toggles the enhanced view on/off for the current page.

All state is local (`chrome.storage.local`) and can be extended later to remote sync.
