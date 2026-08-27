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
      lines.push(block.exportText ?? block.text, '');
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
      out.push(`<p>${escapeHtml(block.exportText ?? block.text)}</p>`);
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
