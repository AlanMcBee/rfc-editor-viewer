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
- **Heading typography**: Clear `h1`–`h6` visual hierarchy with appropriate sizing, spacing, and contrast.
- **Floating Contents TOC**: Floating Table of Contents drawer anchored to the sticky toolbar, staying accessible at any scroll depth.
- **Strict link matching**: Preserves existing section/RFC hyperlinks while preventing arbitrary text numbers from being hyperlinked.
- **Definition & term formatting**: Highlights term definitions with left accent borders and bold term labels.
- **Quoted passage formatting**: Indented citations and quotes rendered with left blockquote borders and italic styling.
- **Diagram & ASCII art preservation**: Captures multi-line diagrams and captions (`Figure X: ...`) without splitting or line omission.
- **Page break controls**: Page breaks hidden by default; includes a sticky toolbar toggle button ("Page breaks: On/Off") persisted per page.
- **Multi-mode paragraph controls**: Hover affordances to toggle between rewrapped text, original line breaks, and raw monospace whitespace.
- **Bullet list detection**: Automatically groups bulletized paragraphs (`o`, `*`, `-`, `+`, `1.`) into structured HTML `<ul>` and `<li>` elements.
- Width controls with preset and custom CSS units
- Section collapse/expand (per section and all sections)
- Clipboard export as Markdown or HTML including title and source URL
- Per-page reset and global reset actions
- Failure signaling via toolbar badge and on-page message with console diagnostics

## Packaging notes

- Uses npm-managed dependencies so Dependabot can monitor updates.
- Manifest is MV3; clicking the toolbar icon toggles the enhanced view, and an options page holds global defaults.
