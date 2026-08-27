import test from 'node:test';
import assert from 'node:assert/strict';
import { exportHtml, exportMarkdown } from '../src/lib/exporter.js';

const blocks = [
  { kind: 'heading', level: 2, text: '1 Intro' },
  { kind: 'paragraph', text: 'Hello RFC' },
  { kind: 'pagebreak', footer: '[Page 1]', header: 'RFC 9999' }
];

test('exportMarkdown includes source metadata and headings', () => {
  const markdown = exportMarkdown({ title: 'RFC Test', sourceUrl: 'https://www.rfc-editor.org/rfc/rfc9999', includeCollapsed: true, includePageBreaks: true, blocks });
  assert.match(markdown, /# RFC Test/);
  assert.match(markdown, /Source:/);
  assert.match(markdown, /## 1 Intro/);
});

test('exportHtml emits article wrapper with source link', () => {
  const html = exportHtml({ title: 'RFC Test', sourceUrl: 'https://www.rfc-editor.org/rfc/rfc9999', includeCollapsed: true, includePageBreaks: false, blocks });
  assert.match(html, /<article>/);
  assert.match(html, /RFC Test/);
  assert.match(html, /https:\/\/www.rfc-editor.org\/rfc\/rfc9999/);
});
