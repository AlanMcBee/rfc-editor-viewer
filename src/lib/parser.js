function isPageHeaderLine(line) {
  return /^\s*(RFC\s+\d+|Internet[- ]Draft|Request for Comments|\d{4}-\d{2}-\d{2})/i.test(line);
}

function isPageFooterLine(line) {
  return /\[\s*Page\s+\d+\s*\]/i.test(line) || /^\s*Expires\s+/i.test(line);
}

function isBulletLine(line) {
  return /^\s*([*\-+]|\d+\.)\s+/.test(line);
}

function isHeadingLine(line) {
  return /^\d+(\.\d+)*\s+\S+/.test(line.trim());
}

function headingLevel(line) {
  const match = line.trim().match(/^(\d+(?:\.\d+)*)\s+/);
  if (!match) {
    return 2;
  }
  return Math.min(match[1].split('.').length + 1, 6);
}

function isTableLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (/(\|.*\|)/.test(trimmed)) {
    return true;
  }
  return /^\+[-+]+\+$/.test(trimmed) || /\S+\s{2,}\S+\s{2,}\S+/.test(line);
}

function isAsciiArtLine(line) {
  if (!line.trim()) {
    return false;
  }
  if (isBulletLine(line) || isTableLine(line) || isHeadingLine(line)) {
    return false;
  }
  return /^\S+\s{2,}\S+/.test(line) || /[+|\\/]{2,}/.test(line);
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s\])>]+)([\])>]*)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>$2');
}

export function parseRfcText(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraphBuffer = [];
  let tableBuffer = [];
  let pendingFooter = null;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }

    const linesCopy = paragraphBuffer;
    paragraphBuffer = [];

    blocks.push({
      kind: 'paragraph',
      text: linesCopy.join(' '),
      originalText: linesCopy.join('\n'),
      html: linkify(linesCopy.join(' '))
    });
  };

  const flushTable = () => {
    if (!tableBuffer.length) {
      return;
    }

    const linesCopy = tableBuffer;
    tableBuffer = [];
    blocks.push({ kind: 'table-pre', lines: linesCopy, text: linesCopy.join('\n') });
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (isPageFooterLine(trimmed)) {
      flushTable();
      flushParagraph();
      pendingFooter = trimmed;
      continue;
    }

    if (isPageHeaderLine(trimmed) && pendingFooter) {
      flushTable();
      blocks.push({ kind: 'pagebreak', footer: pendingFooter, header: trimmed });
      pendingFooter = null;
      continue;
    }

    if (!trimmed.trim()) {
      flushTable();
      flushParagraph();
      continue;
    }

    if (isHeadingLine(trimmed)) {
      flushTable();
      flushParagraph();
      blocks.push({ kind: 'heading', level: headingLevel(trimmed), text: trimmed.trim(), id: slug(trimmed.trim()) });
      continue;
    }

    if (isAsciiArtLine(trimmed) || isBulletLine(trimmed)) {
      flushTable();
      flushParagraph();
      blocks.push({ kind: 'pre', role: isAsciiArtLine(trimmed) ? 'diagram' : 'bullet', text: trimmed });
      continue;
    }

    if (isTableLine(trimmed)) {
      flushParagraph();
      tableBuffer.push(trimmed);
      continue;
    }

    flushTable();
    paragraphBuffer.push(trimmed.trim());
  }

  flushTable();
  flushParagraph();

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
