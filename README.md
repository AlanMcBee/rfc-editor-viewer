# rfc-editor-viewer

Chromium (Edge or Chrome) extension to make RFCs easier to read on rfc-editor.org.

## Quick start

```bash
npm install
npm run build
```

Load `/dist` as an unpacked extension in Edge/Chrome.

## Development

```bash
npm test
npm run build
```

## Current capabilities

- Runtime feature flags and local settings via `chrome.storage.local`
- RFC content enhancement for `div.rfc-content`
- Paragraph rewrap and per-paragraph line-break toggles
- Width controls with preset and custom CSS units
- Section collapse/expand (per section and all sections)
- Page-break header/footer suppression with low-contrast separators
- Diagram/table monospace preservation with optional table rendering when parseable
- Clipboard export as Markdown or HTML including title and source URL
- Per-page reset and global reset actions
- Failure signaling via toolbar badge and on-page message with console diagnostics

## Packaging notes

- Uses npm-managed dependencies so Dependabot can monitor updates.
- Manifest is MV3 and includes options/popup for store-readiness groundwork.
