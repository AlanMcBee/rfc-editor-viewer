export function exportMarkdown({ title, sourceUrl, includeCollapsed, includePageBreaks, blocks }) {
  const lines = [`# ${title}`, '', `Source: ${sourceUrl}`, ''];

  for (const block of blocks) {
    if (!includeCollapsed && block.hidden) {
      continue;
    }

    if (block.kind === 'pagebreak') {
      if (includePageBreaks) {
        lines.push('---', `> ${block.footer} / ${block.header}`, '---', '');
      }
      continue;
    }

    if (block.kind === 'heading') {
      lines.push(`${'#'.repeat(block.level)} ${block.text}`, '');
      continue;
    }

    if (block.kind === 'paragraph') {
      const text = block.exportText ?? block.text;
      if (block.isBullet) {
        lines.push(`- ${text}`, '');
      } else if (block.isQuote) {
        lines.push(`> ${text}`, '');
      } else {
        lines.push(text, '');
      }
      continue;
    }

    if (block.kind === 'pre' || block.kind === 'table-pre') {
      lines.push('```text', block.text, '```', '');
    }
  }

  return lines.join('\n').trim() + '\n';
}

export function exportHtml({ title, sourceUrl, includeCollapsed, includePageBreaks, blocks }) {
  const out = [];
  out.push(`<article><h1>${escapeHtml(title)}</h1><p>Source: <a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a></p>`);

  for (const block of blocks) {
    if (!includeCollapsed && block.hidden) {
      continue;
    }

    if (block.kind === 'pagebreak' && includePageBreaks) {
      out.push(`<hr><p><small>${escapeHtml(block.footer)} / ${escapeHtml(block.header)}</small></p>`);
      continue;
    }

    if (block.kind === 'heading') {
      out.push(`<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`);
      continue;
    }

    if (block.kind === 'paragraph') {
      const content = escapeHtml(block.exportText ?? block.text);
      if (block.isBullet) {
        out.push(`<ul><li><p>${content}</p></li></ul>`);
      } else if (block.isQuote) {
        out.push(`<blockquote><p>${content}</p></blockquote>`);
      } else if (block.isDefinition) {
        out.push(`<div class="rev-term"><p>${content}</p></div>`);
      } else {
        out.push(`<p>${content}</p>`);
      }
      continue;
    }

    if (block.kind === 'pre' || block.kind === 'table-pre') {
      out.push(`<pre>${escapeHtml(block.text)}</pre>`);
    }
  }

  out.push('</article>');
  return out.join('');
}

export function escapeHtml(input) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
