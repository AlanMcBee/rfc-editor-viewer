import { DEFAULT_SETTINGS, STORAGE_KEYS, mergeSettings, pageStorageKey, resolvedContentWidth } from '../lib/settings.js';
import { buildAsciiTableRows, parseRfcText } from '../lib/parser.js';
import { exportHtml, exportMarkdown } from '../lib/exporter.js';

const ROOT_CLASS = 'rev-root';

async function getSettings() {
  const key = pageStorageKey(location.href);
  const values = await chrome.storage.local.get([STORAGE_KEYS.GLOBAL, key]);
  const merged = mergeSettings(DEFAULT_SETTINGS, values[STORAGE_KEYS.GLOBAL]);
  return mergeSettings(merged, values[key]);
}

async function savePageSettings(partialPage) {
  const key = pageStorageKey(location.href);
  const values = await chrome.storage.local.get([STORAGE_KEYS.GLOBAL, key]);
  const merged = mergeSettings(mergeSettings(DEFAULT_SETTINGS, values[STORAGE_KEYS.GLOBAL]), values[key]);
  const next = mergeSettings(merged, { page: partialPage });
  await chrome.storage.local.set({ [key]: { page: next.page } });
}

function createToolbar(settings, applyWidth) {
  const toolbar = document.createElement('div');
  toolbar.className = 'rev-toolbar';
  toolbar.innerHTML = `
    <label>Width
      <select class="rev-width-select">
        <option value="65ch">65ch</option>
        <option value="72ch">72ch</option>
        <option value="80ch">80ch</option>
        <option value="56rem">56rem</option>
        <option value="100%">100%</option>
        <option value="custom">Custom</option>
      </select>
    </label>
    <input class="rev-width-custom" placeholder="72ch" aria-label="Custom width" />
    <button class="rev-collapse-all">Collapse all</button>
    <button class="rev-expand-all">Expand all</button>
  `;

  const select = toolbar.querySelector('.rev-width-select');
  const custom = toolbar.querySelector('.rev-width-custom');
  select.value = settings.page.widthPreset;
  custom.value = settings.page.customWidth;

  select.addEventListener('change', async () => {
    await savePageSettings({ widthPreset: select.value });
    applyWidth();
  });

  custom.addEventListener('change', async () => {
    await savePageSettings({ widthPreset: 'custom', customWidth: custom.value.trim() });
    select.value = 'custom';
    applyWidth();
  });

  return toolbar;
}

function visibleNavWidth() {
  const nav = document.querySelector('nav');
  if (!nav) {
    return 0;
  }

  const styles = getComputedStyle(nav);
  if (styles.display === 'none' || styles.visibility === 'hidden') {
    return 0;
  }

  const rect = nav.getBoundingClientRect();
  if (rect.width < 1 || rect.right <= 0 || rect.left >= window.innerWidth) {
    return 0;
  }

  return rect.width;
}

function groupedBlocks(rawBlocks) {
  const groups = [];
  let current = { heading: null, blocks: [] };

  for (const block of rawBlocks) {
    if (block.kind === 'heading') {
      if (current.heading || current.blocks.length) {
        groups.push(current);
      }
      current = { heading: block, blocks: [] };
    } else {
      current.blocks.push(block);
    }
  }

  if (current.heading || current.blocks.length) {
    groups.push(current);
  }

  return groups;
}

function renderBlock(block, index, settings, persistParagraphMode, persistTableMode) {
  if (block.kind === 'pagebreak') {
    const wrap = document.createElement('div');
    wrap.className = 'rev-pagebreak';
    wrap.title = `${block.footer} | ${block.header}`;
    const line = document.createElement('hr');
    wrap.append(line);
    return { node: wrap, exportBlock: block };
  }

  if (block.kind === 'paragraph') {
    const wrapper = document.createElement('div');
    wrapper.className = 'rev-paragraph-wrap';
    const p = document.createElement('p');
    const key = `p${index}`;
    const wrapped = settings.page.paragraphModes[key] ?? true;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rev-paragraph-toggle';
    button.textContent = wrapped ? 'Keep line breaks' : 'Rewrap';
    button.setAttribute('aria-pressed', String(!wrapped));

    const applyParagraphMode = (mode) => {
      p.textContent = mode ? block.text : block.originalText;
      p.classList.toggle('rev-prewrap', !mode);
      button.textContent = mode ? 'Keep line breaks' : 'Rewrap';
      button.setAttribute('aria-pressed', String(!mode));
    };

    applyParagraphMode(wrapped);

    button.addEventListener('click', async () => {
      const next = !(settings.page.paragraphModes[key] ?? true);
      settings.page.paragraphModes[key] = next;
      applyParagraphMode(next);
      await persistParagraphMode(key, next);
    });

    wrapper.append(button, p);
    return { node: wrapper, exportBlock: { ...block, exportText: wrapped ? block.text : block.originalText } };
  }

  if (block.kind === 'table-pre') {
    const key = `t${index}`;
    const mode = settings.page.tableModes[key] ?? 'mono';
    const wrapper = document.createElement('div');
    wrapper.className = 'rev-table-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rev-table-toggle';

    const pre = document.createElement('pre');
    pre.textContent = block.text;

    const htmlRows = buildAsciiTableRows(block.lines ?? [block.text]);
    const renderMode = async (nextMode) => {
      wrapper.replaceChildren(button);
      if (nextMode === 'table' && htmlRows) {
        const table = document.createElement('table');
        for (const row of htmlRows) {
          const tr = document.createElement('tr');
          for (const cell of row) {
            const td = document.createElement('td');
            td.textContent = cell;
            tr.append(td);
          }
          table.append(tr);
        }
        wrapper.append(table);
      } else {
        wrapper.append(pre);
      }
      if (htmlRows) {
        button.textContent = nextMode === 'mono' ? 'View as table' : 'View as monospace';
      } else {
        button.textContent = 'Monospace only';
        button.disabled = true;
      }
    };

    button.addEventListener('click', async () => {
      const next = (settings.page.tableModes[key] ?? 'mono') === 'mono' ? 'table' : 'mono';
      settings.page.tableModes[key] = next;
      await persistTableMode(key, next);
      await renderMode(next);
    });

    renderMode(mode);
    return { node: wrapper, exportBlock: block };
  }

  if (block.kind === 'pre') {
    const pre = document.createElement('pre');
    pre.textContent = block.text;
    if (block.role === 'diagram') {
      pre.className = 'rev-diagram';
    }
    return { node: pre, exportBlock: block };
  }

  return { node: document.createTextNode(''), exportBlock: block };
}

function collapseSection(section, hidden) {
  section.querySelector('.rev-section-body')?.classList.toggle('rev-hidden', hidden);
  const btn = section.querySelector('.rev-section-toggle');
  if (btn) {
    btn.textContent = hidden ? 'Expand section' : 'Collapse section';
    btn.setAttribute('aria-expanded', String(!hidden));
  }
}

async function processPage() {
  const source = document.querySelector('div.rfc-content');
  if (!source) {
    console.warn('RFC Viewer: could not find div.rfc-content');
    chrome.runtime.sendMessage({ type: 'rev.status', ok: false });
    return;
  }

  const settings = await getSettings();
  if (!settings.featureFlags.enabled) {
    return;
  }

  const blocks = parseRfcText(source.innerText);
  const groups = groupedBlocks(blocks);
  const exportBlocks = [];

  const root = document.createElement('div');
  root.className = ROOT_CLASS;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Enhanced RFC content');

  const applyWidth = async () => {
    const fresh = await getSettings();
    const navWidth = visibleNavWidth();
    root.style.setProperty('--rev-width', resolvedContentWidth(fresh));
    root.style.setProperty('--rev-nav-offset', `${navWidth}px`);
    root.style.setProperty('--rev-font', fresh.page.typeface || 'system-ui');
  };

  const toolbar = createToolbar(settings, applyWidth);
  root.append(toolbar);

  const persistParagraphMode = async (key, mode) => {
    await savePageSettings({ paragraphModes: { [key]: mode } });
  };
  const persistTableMode = async (key, mode) => {
    await savePageSettings({ tableModes: { [key]: mode } });
  };

  groups.forEach((group, groupIndex) => {
    const section = document.createElement('section');
    section.className = 'rev-section';
    section.dataset.sectionKey = `s${groupIndex}`;

    if (group.heading) {
      const h = document.createElement(`h${Math.max(1, Math.min(6, group.heading.level))}`);
      h.id = group.heading.id;
      h.textContent = group.heading.text;

      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'rev-section-toggle';
      collapse.setAttribute('aria-expanded', 'true');
      collapse.textContent = 'Collapse section';

      collapse.addEventListener('click', async () => {
        const key = `s${groupIndex}`;
        const next = !(settings.page.collapsedSections[key] ?? false);
        settings.page.collapsedSections[key] = next;
        collapseSection(section, next);
        await savePageSettings({ collapsedSections: { [key]: next } });
      });

      const headingWrap = document.createElement('div');
      headingWrap.className = 'rev-heading-wrap';
      headingWrap.append(h, collapse);
      section.append(headingWrap);
      exportBlocks.push({ ...group.heading, sectionKey: section.dataset.sectionKey });
    }

    const body = document.createElement('div');
    body.className = 'rev-section-body';

    group.blocks.forEach((block, idx) => {
      const rendered = renderBlock(block, groupIndex * 10000 + idx, settings, persistParagraphMode, persistTableMode);
      body.append(rendered.node);
      exportBlocks.push({ ...rendered.exportBlock, sectionKey: section.dataset.sectionKey });
    });

    section.append(body);
    const key = `s${groupIndex}`;
    collapseSection(section, Boolean(settings.page.collapsedSections[key]));
    root.append(section);
  });

  source.replaceChildren(root);
  await applyWidth();
  window.addEventListener('resize', applyWidth);

  toolbar.querySelector('.rev-collapse-all')?.addEventListener('click', async () => {
    const updates = {};
    root.querySelectorAll('.rev-section').forEach((section) => {
      collapseSection(section, true);
      updates[section.dataset.sectionKey] = true;
    });
    await savePageSettings({ collapsedSections: updates });
  });

  toolbar.querySelector('.rev-expand-all')?.addEventListener('click', async () => {
    const updates = {};
    root.querySelectorAll('.rev-section').forEach((section) => {
      collapseSection(section, false);
      updates[section.dataset.sectionKey] = false;
    });
    await savePageSettings({ collapsedSections: updates });
  });

  chrome.runtime.onMessage.addListener(async (message) => {
    if (message?.type === 'rev.collapseAll') {
      const updates = {};
      root.querySelectorAll('.rev-section').forEach((section) => {
        collapseSection(section, true);
        updates[section.dataset.sectionKey] = true;
      });
      await savePageSettings({ collapsedSections: updates });
      return;
    }

    if (message?.type === 'rev.expandAll') {
      const updates = {};
      root.querySelectorAll('.rev-section').forEach((section) => {
        collapseSection(section, false);
        updates[section.dataset.sectionKey] = false;
      });
      await savePageSettings({ collapsedSections: updates });
      return;
    }

    if (message?.type === 'rev.resetPage') {
      await chrome.storage.local.remove(pageStorageKey(location.href));
      location.reload();
      return;
    }

    if (message?.type === 'rev.resetAll') {
      const all = await chrome.storage.local.get(null);
      const pageKeys = Object.keys(all).filter((key) => key.startsWith(STORAGE_KEYS.PAGE_PREFIX));
      await chrome.storage.local.remove(pageKeys);
      location.reload();
      return;
    }

    if (message?.type === 'rev.exportMarkdown') {
      const latest = await getSettings();
      const markdown = exportMarkdown({
        title: document.title,
        sourceUrl: location.href,
        includeCollapsed: latest.page.includeCollapsedInExport,
        includePageBreaks: latest.page.includePageBreaksInExport,
        blocks: exportBlocks.map((block) => ({
          ...block,
          hidden: Boolean(latest.page.collapsedSections[block.sectionKey])
        }))
      });
      await navigator.clipboard.writeText(markdown);
      return;
    }

    if (message?.type === 'rev.exportHtml') {
      const latest = await getSettings();
      const html = exportHtml({
        title: document.title,
        sourceUrl: location.href,
        includeCollapsed: latest.page.includeCollapsedInExport,
        includePageBreaks: latest.page.includePageBreaksInExport,
        blocks: exportBlocks.map((block) => ({
          ...block,
          hidden: Boolean(latest.page.collapsedSections[block.sectionKey])
        }))
      });
      await navigator.clipboard.writeText(html);
    }
  });

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    const currentKey = pageStorageKey(location.href);
    if (changes[STORAGE_KEYS.GLOBAL] || changes[currentKey]) {
      await applyWidth();
    }
  });

  chrome.runtime.sendMessage({ type: 'rev.status', ok: true });
}

processPage().catch((error) => {
  console.error('RFC Viewer failed to process this page', error);
  chrome.runtime.sendMessage({ type: 'rev.status', ok: false });

  const notice = document.createElement('div');
  notice.textContent = 'RFC Viewer failed to process this RFC. See browser console for details.';
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:#b00020;color:white;padding:0.5rem 0.75rem;z-index:999999;';
  document.body.append(notice);
});
