import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAsciiTableRows, parseHeading, parseRfcText } from '../src/lib/parser.js';

test('parseHeading handles numbered, appendix, and unnumbered sections', () => {
  const h1 = parseHeading('1.  Introduction');
  assert.deepEqual(h1, {
    num: '1',
    title: 'Introduction',
    level: 2,
    id: 'section-1',
    text: '1.  Introduction'
  });

  const h2 = parseHeading('3.1.  Practical Considerations');
  assert.deepEqual(h2, {
    num: '3.1',
    title: 'Practical Considerations',
    level: 3,
    id: 'section-3.1',
    text: '3.1.  Practical Considerations'
  });

  const hAbs = parseHeading('Abstract');
  assert.deepEqual(hAbs, {
    title: 'Abstract',
    level: 2,
    id: 'abstract',
    text: 'Abstract'
  });

  const hToc = parseHeading('Table of Contents');
  assert.deepEqual(hToc, {
    title: 'Table of Contents',
    level: 2,
    id: 'table-of-contents',
    text: 'Table of Contents'
  });
});

test('parseRfcText detects heading, paragraph, and pagebreak', () => {
  const input = `1.  Introduction\n\nHello world\n\n[Page 1]\nRFC 9999\n\n2.  Details\nMore text`;
  const blocks = parseRfcText(input);

  assert.equal(blocks.some((b) => b.kind === 'heading' && b.text.includes('Introduction')), true);
  assert.equal(blocks.some((b) => b.kind === 'pagebreak'), true);
  assert.equal(blocks.some((b) => b.kind === 'paragraph' && b.text.includes('Hello world')), true);
});

test('parseRfcText keeps multi-line ASCII diagrams together', () => {
  const input = `
            --------------       Customer        ----------------------
           |              |    Service Model    |                      |
           |   Customer   | <-----------------> |   Network Operator   |
           |              |                     |                      |
            --------------                       ----------------------

Figure 1: The Customer Service Models Used on the Interface between Customers and Network Operators
`;
  const blocks = parseRfcText(input.trim());
  const diagramBlocks = blocks.filter((b) => b.kind === 'pre' && b.role === 'diagram');
  assert.equal(diagramBlocks.length, 1);
  assert.ok(diagramBlocks[0].text.includes('Customer'));
  assert.ok(diagramBlocks[0].text.includes('Network Operator'));
});

test('parseRfcText groups Table of Contents entries without breaking into paragraphs', () => {
  const input = `Table of Contents\n\n   1.  Introduction  . . . . . . . . . . . . . . . . . . . . . . . .   3\n   2.  Terms and Concepts  . . . . . . . . . . . . . . . . . . . .   4\n\n1.  Introduction\n\nThis is the intro.`;
  const blocks = parseRfcText(input);

  const tocHeading = blocks.find((b) => b.kind === 'heading' && b.id === 'table-of-contents');
  assert.ok(tocHeading);

  const tocBlock = blocks.find((b) => b.kind === 'pre' && b.role === 'toc');
  assert.ok(tocBlock);
  assert.ok(tocBlock.text.includes('1.  Introduction'));
  assert.ok(tocBlock.text.includes('2.  Terms and Concepts'));

  const introHeading = blocks.find((b) => b.kind === 'heading' && b.id === 'section-1');
  assert.ok(introHeading);
});

test('buildAsciiTableRows parses simple pipe table', () => {
  const rows = buildAsciiTableRows(['| a | b |', '| c | d |']);
  assert.deepEqual(rows, [['a', 'b'], ['c', 'd']]);
});
