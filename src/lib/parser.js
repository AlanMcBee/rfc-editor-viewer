const UNNUMBERED_HEADINGS = new Set([
  'abstract',
  'status of this memo',
  'copyright notice',
  'table of contents',
  'acknowledgements',
  'acknowledgments',
  'authors\' addresses',
  'author\'s address',
  'contributors',
  'contributor\'s address',
  'security considerations',
  'iana considerations',
  'references',
  'full copyright statement',
  'intellectual property'
]);

function isPageHeaderLine(line) {
  return /^\s*(RFC\s+\d+|Internet[- ]Draft|Request for Comments|\d{4}-\d{2}-\d{2})/i.test(line);
}

function isPageFooterLine(line) {
  return /\[\s*Page\s+\d+\s*\]/i.test(line) || /^\s*Expires\s+/i.test(line);
}

function isBulletLine(line) {
  return /^\s*([*+\-]|\d+\.|\([a-z0-9]+\)|o)\s{1,3}\S+/i.test(line);
}

function matchNumberedHeading(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)*)\.?\s{2,}(.+)$/);
  if (!match) {
    return null;
  }
  const num = match[1];
  const title = match[2].trim();
  // Ensure it's not a TOC entry with dot leaders and page number
  if (/\.\s*\.\s*\.\s*\d+$/.test(title)) {
    return null;
  }
  return {
    num,
    title,
    level: Math.min(num.split('.').length + 1, 6),
    id: `section-${num}`,
    text: `${num}.  ${title}`
  };
}

function matchAppendixHeading(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^(?:Appendix\s+)?([A-Z](?:\.\d+)*)\.?\s{1,}(.+)$/i);
  if (!match) {
    return null;
  }
  const app = match[1].toUpperCase();
  const title = match[2].trim();
  if (/\.\s*\.\s*\.\s*\d+$/.test(title)) {
    return null;
  }
  return {
    app,
    title,
    level: Math.min(app.split('.').length + 1, 6),
    id: `appendix-${app.toLowerCase()}`,
    text: `Appendix ${app}.  ${title}`
  };
}

function matchUnnumberedHeading(line) {
  const trimmed = line.trim();
  const normalized = trimmed.toLowerCase();
  if (UNNUMBERED_HEADINGS.has(normalized)) {
    return {
      title: trimmed,
      level: 2,
      id: slug(trimmed),
      text: trimmed
    };
  }
  return null;
}

export function parseHeading(line) {
  return matchNumberedHeading(line) || matchAppendixHeading(line) || matchUnnumberedHeading(line);
}

function isHeadingLine(line) {
  return parseHeading(line) !== null;
}

function isTocLine(line) {
  return /\.\s*\.\s*\.\s*\.\s*\d+\s*$/.test(line);
}

function isDiagramLine(line, inDiagram = false) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  // Box borders and ASCII connectors
  if (/^(\+[-=+]+\+|[-=]{4,}|[|_]{4,})$/.test(trimmed)) {
    return true;
  }
  if (/[+\\][-=]+[+\\/]|<[-=]+>|[-=]+>|<[-=]+|\+--|--!?>|\|\s+[A-Za-z0-9]/.test(line)) {
    return true;
  }
  if (/^\|\s*.*\s*\|$/.test(trimmed) && !trimmed.includes('  ')) {
    return true;
  }
  if (inDiagram) {
    // If we're already buffering a diagram, indented structural lines, labels, arrows or captions continue it
    if (/^\s{2,}/.test(line) && (/[|:+<\->\\/]/.test(line) || /^Figure\s+\d+:/i.test(trimmed))) {
      return true;
    }
  }
  return false;
}

function isTableLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  // True table delimiter rows: | col1 | col2 | or +---+---+
  if (/^\|[^|]+\|[^|]+\|$/.test(trimmed) || /^\+[-+]+\+$/.test(trimmed)) {
    return true;
  }
  return false;
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s\])>]+)([\])>]*)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>$2');
}

export function parseRfcText(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraphBuffer = [];
  let diagramBuffer = [];
  let tableBuffer = [];
  let tocBuffer = [];
  let pendingFooter = null;
  let inTocSection = false;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const linesCopy = paragraphBuffer;
    paragraphBuffer = [];
    const text = linesCopy.join(' ');
    blocks.push({
      kind: 'paragraph',
      text,
      originalText: linesCopy.join('\n'),
      html: linkify(text)
    });
  };

  const flushDiagram = () => {
    if (!diagramBuffer.length) {
      return;
    }
    const linesCopy = diagramBuffer;
    diagramBuffer = [];
    blocks.push({
      kind: 'pre',
      role: 'diagram',
      text: linesCopy.join('\n')
    });
  };

  const flushTable = () => {
    if (!tableBuffer.length) {
      return;
    }
    const linesCopy = tableBuffer;
    tableBuffer = [];
    blocks.push({
      kind: 'table-pre',
      lines: linesCopy,
      text: linesCopy.join('\n')
    });
  };

  const flushToc = () => {
    if (!tocBuffer.length) {
      return;
    }
    const linesCopy = tocBuffer;
    tocBuffer = [];
    blocks.push({
      kind: 'pre',
      role: 'toc',
      text: linesCopy.join('\n')
    });
  };

  const flushAll = () => {
    flushDiagram();
    flushTable();
    flushToc();
    flushParagraph();
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trimEnd();

    if (isPageFooterLine(trimmed)) {
      flushAll();
      pendingFooter = trimmed;
      continue;
    }

    if (isPageHeaderLine(trimmed) && pendingFooter) {
      flushAll();
      blocks.push({ kind: 'pagebreak', footer: pendingFooter, header: trimmed });
      pendingFooter = null;
      continue;
    }

    if (!trimmed.trim()) {
      if (diagramBuffer.length && i + 1 < lines.length && isDiagramLine(lines[i + 1], true)) {
        // Keep empty line inside multi-line diagram if next line continues diagram
        diagramBuffer.push(rawLine);
      } else {
        flushAll();
      }
      continue;
    }

    const heading = parseHeading(trimmed);
    if (heading) {
      flushAll();
      inTocSection = heading.id === 'table-of-contents';
      blocks.push({
        kind: 'heading',
        level: heading.level,
        text: heading.text,
        id: heading.id
      });
      continue;
    }

    if (inTocSection && isTocLine(trimmed)) {
      flushParagraph();
      flushDiagram();
      flushTable();
      tocBuffer.push(rawLine);
      continue;
    }

    if (isTableLine(trimmed)) {
      flushParagraph();
      flushDiagram();
      flushToc();
      tableBuffer.push(rawLine);
      continue;
    }

    if (isDiagramLine(rawLine, diagramBuffer.length > 0)) {
      flushParagraph();
      flushTable();
      flushToc();
      diagramBuffer.push(rawLine);
      continue;
    }

    flushDiagram();
    flushTable();
    flushToc();
    paragraphBuffer.push(trimmed.trim());
  }

  flushAll();

  return blocks;
}

export function buildAsciiTableRows(tableLines) {
  const cleaned = tableLines.map((line) => line.trim()).filter(Boolean);
  const pipeLines = cleaned.filter((line) => line.includes('|'));
  if (pipeLines.length < 2) {
    return null;
  }

  const rows = pipeLines.map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean));
  const width = rows[0].length;
  if (width < 2 || rows.some((row) => row.length !== width)) {
    return null;
  }

  return rows;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
