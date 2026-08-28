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
  const match = trimmed.match(/^(?:Appendix\s+([A-Z](?:\.\d+)*)\.?|([A-Z](?:\.\d+)*)\.)\s+(.+)$/);
  if (!match) {
    return null;
  }
  const app = (match[1] || match[2]).toUpperCase();
  const title = match[3].trim();
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

function isDiagramStartLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  // Box borders and ASCII connectors
  if (/^(\+[-=+]+\+|[-=]{4,}|[|_]{4,})$/.test(trimmed)) {
    return true;
  }
  // RFC diagrams often begin with a labeled horizontal border, such as
  // "-------------- Customer ----------------".
  if (/[-=]{4,}.*[-=]{4,}/.test(line)) {
    return true;
  }
  if (/[+\\][-=]+[+\\/]|<[-=]+>|[-=]+>|<[-=]+|\+--|--!?>|\|\s+[A-Za-z0-9]/.test(line)) {
    return true;
  }
  if (/^\|\s*.*\s*\|$/.test(trimmed)) {
    return true;
  }
  return false;
}

function isDiagramLine(line, inDiagram = false) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (isDiagramStartLine(line)) {
    return true;
  }

  if (inDiagram) {
    if (/^\s*Figure\s+\d+[:.]/i.test(trimmed)) {
      return true;
    }
    if (/^\s{2,}/.test(line)) {
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
  // True table delimiter rows with multiple columns: | col1 | col2 | or +---+---+
  if (/^\|[^|]+\|[^|]+\|$/.test(trimmed) || /^\+[-+]+\+[-+]+\+$/.test(trimmed)) {
    return true;
  }
  return false;
}

function linksInText(text, links) {
  return links.filter((link) => {
    if (!link.text || /^\d+(\.\d+)*\.?$/.test(link.text)) {
      return false;
    }
    const escaped = link.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\b|\\s)${escaped}(?:$|\\b|\\s)`, 'i');
    return regex.test(text);
  });
}

export function parseRfcText(rawText, links = []) {
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

    const firstLine = linesCopy[0];
    const bulletMatch = firstLine.match(/^(\s{0,4})(([*+\-]|\d+\.|\([a-z0-9]+\)|o))\s{1,4}(\S.*)$/i);

    let isBullet = false;
    let bulletMarker = null;
    let isDefinition = false;
    let termName = null;
    let isQuote = false;

    const nonBlankLines = linesCopy.filter((l) => l.trim().length > 0);
    const indents = nonBlankLines.map((l) => {
      const m = l.match(/^(\s*)/);
      return m ? m[1].length : 0;
    });
    const minIndent = indents.length ? Math.min(...indents) : 0;

    if (bulletMatch) {
      isBullet = true;
      bulletMarker = bulletMatch[2];
      linesCopy[0] = bulletMatch[1] + bulletMatch[4];
    } else {
      const termMatch = firstLine.match(/^(\s{0,4})([A-Z][A-Za-z0-9_\s\-/'"()]+:)(\s+|$)(.*)/);
      const hangingIndent = linesCopy.length > 1 && indents[0] <= 4 && indents.slice(1).every((ind) => ind >= 6);

      if (termMatch && !/^\s*Figure\s+\d+:/i.test(firstLine)) {
        isDefinition = true;
        termName = termMatch[2];
      } else if (hangingIndent) {
        isDefinition = true;
      } else if (minIndent >= 6) {
        isQuote = true;
      }
    }

    const text = linesCopy.map((l) => l.trim()).join(' ');
    const originalText = linesCopy.join('\n');

    const block = {
      kind: 'paragraph',
      text,
      originalText,
      links: linksInText(text, links)
    };

    if (isBullet) {
      block.isBullet = true;
      block.bulletMarker = bulletMarker;
    }
    if (isDefinition) {
      block.isDefinition = true;
      if (termName) {
        block.termName = termName;
      }
    }
    if (isQuote) {
      block.isQuote = true;
    }

    blocks.push(block);
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
      flushDiagram();
      flushTable();
      flushToc();
      pendingFooter = trimmed;
      continue;
    }

    if (isPageHeaderLine(trimmed) && pendingFooter) {
      flushDiagram();
      flushTable();
      flushToc();
      blocks.push({ kind: 'pagebreak', footer: pendingFooter, header: trimmed });
      pendingFooter = null;
      continue;
    }

    if (!trimmed.trim()) {
      if (diagramBuffer.length) {
        let upcomingIsDiagram = false;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim()) {
            upcomingIsDiagram = isDiagramLine(lines[j], true);
            break;
          }
        }
        if (upcomingIsDiagram) {
          diagramBuffer.push(rawLine);
          continue;
        }
      }
      flushAll();
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

    if (diagramBuffer.length > 0) {
      const isCaptionLine = /^\s*Figure\s+\d+[:.]/i.test(trimmed);
      const hasCaption = diagramBuffer.some((l) => /^\s*Figure\s+\d+[:.]/i.test(l.trim()));

      if (isCaptionLine) {
        diagramBuffer.push(rawLine);
        continue;
      }

      if (hasCaption) {
        if (/^\s{2,}\S/.test(rawLine) && !parseHeading(trimmed) && !isTableLine(trimmed)) {
          diagramBuffer.push(rawLine);
          continue;
        } else {
          flushDiagram();
        }
      } else if (isDiagramLine(rawLine, true)) {
        diagramBuffer.push(rawLine);
        continue;
      } else {
        flushDiagram();
      }
    }

    if (isDiagramStartLine(rawLine)) {
      flushParagraph();
      flushTable();
      flushToc();
      diagramBuffer.push(rawLine);
      continue;
    }

    flushDiagram();
    flushTable();
    flushToc();
    paragraphBuffer.push(rawLine);
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
