# Architecture

## Modules

- `src/lib/settings.js`: Default settings, feature flags (`showPageBreaks: false`), width normalization, and setting merge helpers.
- `src/lib/parser.js`: Sequential line-by-line RFC text parser outputting semantic block types:
  - `heading`: Section numbers (`h1`–`h6`), appendixes, and standard unnumbered sections.
  - `paragraph`: Formatted text block with flags for `isBullet` (bullet marker), `isDefinition` (term name), and `isQuote` (blockquote).
  - `pre`: Monospace ASCII art/diagrams (with multi-line `Figure X:` caption retention) and Table of Contents blocks.
  - `table-pre`: Delimited grid tables with optional HTML `<table>` rendering.
  - `pagebreak`: Header/footer boundary markers (hidden by default).
- `src/lib/exporter.js`: Markdown and HTML export generators respecting visibility state, lists, blockquotes, and definition blocks.
- `src/extension/content-script.js`: DOM transformation engine, sticky toolbar, floating Table of Contents drawer, hover affordances, and settings synchronization.
- `src/extension/background.js`: Extension action icon listener and error/status badge updater.
- `src/extension/options.js`: Options page script for global defaults and feature toggles.

## Interaction & UI Structure

- **Toolbar & Table of Contents**: Sticky header `.rev-toolbar` at `z-index: 100` containing width controls, page-break toggle ("Page breaks: On/Off"), collapse/expand controls, menu overflow, and an expandable Table of Contents drawer (`.rev-nav-drawer` at `z-index: 101`) that floats relative to the toolbar anywhere down the page.
- **Heading Hierarchy**: Distinct `h1`–`h6` rules scoped to `.rev-root .rev-heading-wrap` ensuring clear visual weight over body text.
- **Link Preservation & Boundaries**: `appendParagraphContent` links existing hyperlinks onto text using strict word-boundary matching (`isWordBoundary`) and filters out isolated numbers to prevent false section link additions.
- **Paragraph Modes**: Paragraph hover affordance group provides two toggles: rewrap/original linebreaks (`↵`/`¶`) and raw monospace whitespace mode (`≡`/`♯`).
- **Lists & Definitions**: Bulletized items are wrapped in `<ul class="rev-bullet-list"><li>` wrappers; definitions receive `.rev-term` styling with bold headers and accent borders; quoted passages receive `.rev-quote` styling.

All state is local (`chrome.storage.local`) and keyed per RFC pathname.
