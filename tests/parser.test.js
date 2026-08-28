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

  assert.equal(parseHeading('A small number of YANG modules'), null);
  assert.deepEqual(parseHeading('Appendix A.  Examples'), {
    app: 'A',
    title: 'Examples',
    level: 2,
    id: 'appendix-a',
    text: 'Appendix A.  Examples'
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

test('parseRfcText keeps a labeled diagram border in the diagram block', () => {
  const input = `--------------       Customer        ----------------------
           |              |    Service Model    |                      |
           |   Customer   | <-----------------> |   Network Operator   |
            --------------                       ----------------------`;
  const [diagram] = parseRfcText(input).filter((block) => block.kind === 'pre' && block.role === 'diagram');

  assert.ok(diagram.text.startsWith('--------------'));
  assert.ok(diagram.text.includes('Network Operator'));
});

test('parseRfcText retains source link metadata for paragraphs', () => {
  const [paragraph] = parseRfcText('See RFC 8049 for details.', [
    { text: 'RFC 8049', href: 'https://www.rfc-editor.org/info/rfc8049/' }
  ]);

  assert.deepEqual(paragraph.links, [
    { text: 'RFC 8049', href: 'https://www.rfc-editor.org/info/rfc8049/' }
  ]);
});

test('parseRfcText excludes bare number fragments from links', () => {
  const [paragraph] = parseRfcText('See RFC 8049 for details.', [
    { text: 'RFC', href: 'https://www.rfc-editor.org/info/rfc8049/' },
    { text: '8049', href: 'https://www.rfc-editor.org/info/rfc8049/' },
    { text: 'RFC 8049', href: 'https://www.rfc-editor.org/info/rfc8049/' }
  ]);

  assert.deepEqual(paragraph.links, [
    { text: 'RFC', href: 'https://www.rfc-editor.org/info/rfc8049/' },
    { text: 'RFC 8049', href: 'https://www.rfc-editor.org/info/rfc8049/' }
  ]);
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

test('parseRfcText keeps multi-line diagram captions and inner labels intact', () => {
  const input = `   +--------------------+
   | System Topology    |
   +--------------------+
             Customer Service Model
   +--------------------+
   | Operator Control   |
   +--------------------+

   Figure 3: Service Models Explained in an SDN Context
             and Customer Service Model`;
  const blocks = parseRfcText(input);
  const diagramBlocks = blocks.filter((b) => b.kind === 'pre' && b.role === 'diagram');

  assert.strictEqual(diagramBlocks.length, 1);
  assert.ok(diagramBlocks[0].text.includes('Customer Service Model'));
  assert.ok(diagramBlocks[0].text.includes('Figure 3: Service Models Explained'));
  assert.ok(diagramBlocks[0].text.includes('and Customer Service Model'));
});

test('parseRfcText joins paragraphs across page breaks', () => {
  const input = `   This is the first part of a long paragraph that spans
   across a page boundary and continues on the next page.
Wu, et al.                    Informational                     [Page 5]
RFC 8309                Service Models Explained            January 2018
   Here is the second part of the exact same paragraph continuing.`;
  const blocks = parseRfcText(input);

  const pb = blocks.find((b) => b.kind === 'pagebreak');
  assert.ok(pb);

  const paragraphs = blocks.filter((b) => b.kind === 'paragraph');
  assert.strictEqual(paragraphs.length, 1);
  assert.ok(paragraphs[0].text.includes('first part of a long paragraph'));
  assert.ok(paragraphs[0].text.includes('second part of the exact same paragraph'));
});

test('parseRfcText detects bullet items, definitions, and blockquotes', () => {
  const input = `   o  First bullet point paragraph.

   Network Operator:  A company or organization that operates
      one or more networks.

         "This is a quoted block passage indented further."`;
  const blocks = parseRfcText(input);

  const bullet = blocks.find((b) => b.isBullet);
  assert.ok(bullet);
  assert.strictEqual(bullet.bulletMarker, 'o');
  assert.ok(bullet.text.includes('First bullet point paragraph'));

  const def = blocks.find((b) => b.isDefinition);
  assert.ok(def);
  assert.strictEqual(def.termName, 'Network Operator:');

  const quote = blocks.find((b) => b.isQuote);
  assert.ok(quote);
  assert.ok(quote.text.includes('quoted block passage'));
});
