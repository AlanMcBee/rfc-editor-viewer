import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAsciiTableRows, parseRfcText } from '../src/lib/parser.js';

test('parseRfcText detects heading, paragraph, and pagebreak', () => {
  const input = `1 Introduction\n\nHello world\n\n[Page 1]\nRFC 9999\n\n2 Details\nMore text`;
  const blocks = parseRfcText(input);

  assert.equal(blocks.some((b) => b.kind === 'heading' && b.text.includes('Introduction')), true);
  assert.equal(blocks.some((b) => b.kind === 'pagebreak'), true);
  assert.equal(blocks.some((b) => b.kind === 'paragraph' && b.text.includes('Hello world')), true);
});

test('buildAsciiTableRows parses simple pipe table', () => {
  const rows = buildAsciiTableRows(['| a | b |', '| c | d |']);
  assert.deepEqual(rows, [['a', 'b'], ['c', 'd']]);
});
