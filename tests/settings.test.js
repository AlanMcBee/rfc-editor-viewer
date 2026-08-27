import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, mergeSettings, normalizeCssWidth, resolvedContentWidth } from '../src/lib/settings.js';

test('normalizeCssWidth allows supported CSS units', () => {
  assert.equal(normalizeCssWidth('68ch'), '68ch');
  assert.equal(normalizeCssWidth(' 56rem '), '56rem');
  assert.equal(normalizeCssWidth('bad', '72ch'), '72ch');
});

test('mergeSettings preserves defaults and nested maps', () => {
  const merged = mergeSettings(DEFAULT_SETTINGS, { page: { paragraphModes: { p1: false } } });
  assert.equal(merged.page.paragraphModes.p1, false);
  assert.equal(merged.page.widthPreset, DEFAULT_SETTINGS.page.widthPreset);
});

test('resolvedContentWidth picks custom width when custom preset selected', () => {
  const settings = mergeSettings(DEFAULT_SETTINGS, { page: { widthPreset: 'custom', customWidth: '88ch' } });
  assert.equal(resolvedContentWidth(settings), '88ch');
});
