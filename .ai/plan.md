# Plan

- Build a Manifest V3 Chromium extension with local storage-backed runtime feature flags.
- Enhance only `div.rfc-content` while preserving the rest of the page.
- Parse RFC text into headings, paragraphs, page breaks, and monospace regions (diagrams/tables/bullets).
- Add per-paragraph rewrap toggle, page-level width controls, section collapse controls, and export actions.
- Persist page-level and global settings in local storage and provide reset actions.
- Add diagnostics and failure indicators via console and extension badge.
- Add unit tests for parser/settings/exporter modules.
- Add `/docs` content suitable for gh-pages publication.
