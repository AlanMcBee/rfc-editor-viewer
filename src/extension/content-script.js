import { DEFAULT_SETTINGS, STORAGE_KEYS, mergeSettings, pageStorageKey, resolvedContentWidth } from '../lib/settings.js';
import { buildAsciiTableRows, parseRfcText } from '../lib/parser.js';
import { exportHtml, exportMarkdown } from '../lib/exporter.js';
import { debugLog } from '../lib/debug.js';

const ROOT_CLASS = 'rev-root';
const HIDDEN_CLASS = 'rev-original-hidden';
// The native page already uses ids like "section-1"; prefix ours so in-page
// anchors resolve to our visible headings instead of the hidden originals.
const ANCHOR_PREFIX = 'rev-';

const state = {
  active: false,
  busy: false,
  href: location.href,
  root: null,
  source: null,
  hidden: [],
  exportBlocks: [],
  applyWidth: null
};

// rfc-editor.org is a Vue SSR app: mutating its DOM before hydration finishes gets patched away.
function whenSettled(target, { quietMs = 250, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    let quietTimer;

    const finish = () => {
      observer.disconnect();
      clearTimeout(quietTimer);
      clearTimeout(hardStop);
      resolve();
    };

    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    });

    const hardStop = setTimeout(() => {
      debugLog('settle wait hit timeout', { timeoutMs });
      finish();
    }, timeoutMs);

    observer.observe(target, { childList: true, subtree: true, characterData: true });
    quietTimer = setTimeout(finish, quietMs);
  });
}

function whenLoaded() {
  if (document.readyState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener('load', () => resolve(), { once: true });
  });
}

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

function reportStatus(ok) {
  try {
    chrome.runtime.sendMessage({ type: 'rev.status', ok, active: state.active });
  } catch {
    // Extension context can be torn down during reloads; status is best-effort.
  }
}

function createToolbar(settings, applyWidth, toggleNav) {
  const toolbar = document.createElement('div');
  toolbar.className = 'rev-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="rev-nav-toggle" aria-expanded="false">Contents</button>
    <label class="rev-width-label">Width
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
    <button type="button" class="rev-pagebreak-toggle">Page breaks: ${settings.page.showPageBreaks ? 'On' : 'Off'}</button>
    <button type="button" data-command="rev.collapseAll">Collapse all</button>
    <button type="button" data-command="rev.expandAll">Expand all</button>
    <details class="rev-menu">
      <summary title="More actions">&hellip;</summary>
      <div class="rev-menu-body">
        <button type="button" data-command="rev.exportMarkdown">Copy Markdown</button>
        <button type="button" data-command="rev.exportHtml">Copy HTML</button>
        <button type="button" data-command="rev.toggle">Show original</button>
        <button type="button" data-command="rev.resetPage">Reset this page</button>
        <button type="button" data-command="rev.resetAll">Reset all pages</button>
      </div>
    </details>
  `;

  const select = toolbar.querySelector('.rev-width-select');
  const custom = toolbar.querySelector('.rev-width-custom');
  const navBtn = toolbar.querySelector('.rev-nav-toggle');
  const pagebreakBtn = toolbar.querySelector('.rev-pagebreak-toggle');

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

  navBtn.addEventListener('click', () => toggleNav());

  pagebreakBtn.addEventListener('click', async () => {
    const next = !(settings.page.showPageBreaks ?? false);
    settings.page.showPageBreaks = next;
    pagebreakBtn.textContent = `Page breaks: ${next ? 'On' : 'Off'}`;
    await savePageSettings({ showPageBreaks: next });
    state.root?.querySelectorAll('.rev-pagebreak').forEach((el) => {
      el.classList.toggle('rev-hidden', !next);
    });
  });

  toolbar.addEventListener('click', (event) => {
    const command = event.target.closest('button[data-command]')?.dataset.command;
    if (command) {
      toolbar.querySelector('.rev-menu')?.removeAttribute('open');
      runCommand(command);
    }
  });

  return toolbar;
}

function createSubstituteNav(groups, onNavigate) {
  const nav = document.createElement('nav');
  nav.className = 'rev-nav rev-nav-drawer rev-hidden';
  nav.setAttribute('aria-label', 'Table of Contents');

  const title = document.createElement('div');
  title.className = 'rev-nav-title';
  title.textContent = 'Table of Contents';
  nav.append(title);

  const list = document.createElement('ul');
  list.className = 'rev-nav-list';

  let entries = 0;
  groups.forEach((group) => {
    if (!group.heading) {
      return;
    }
    entries += 1;
    const targetId = `${ANCHOR_PREFIX}${group.heading.id}`;
    const li = document.createElement('li');
    li.className = `rev-nav-item rev-nav-level-${group.heading.level}`;

    const a = document.createElement('a');
    a.href = `#${targetId}`;
    a.textContent = group.heading.text;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      history.pushState(null, '', `#${targetId}`);
      onNavigate(targetId);
    });

    li.append(a);
    list.append(li);
  });

  nav.append(list);
  debugLog('built substitute nav', { entries });
  return nav;
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

function isWordBoundary(text, index, length) {
  if (index > 0) {
    const charBefore = text[index - 1];
    if (/\w/.test(charBefore) && /\w/.test(text[index])) {
      return false;
    }
  }
  const end = index + length;
  if (end < text.length) {
    const charAfter = text[end];
    if (/\w/.test(text[end - 1]) && /\w/.test(charAfter)) {
      return false;
    }
  }
  return true;
}

function appendParagraphContent(paragraph, text, links, block = null) {
  let termPrefixLength = 0;
  if (block?.termName && text.startsWith(block.termName)) {
    termPrefixLength = block.termName.length;
  }

  const candidates = [...new Map(
    links
      .filter((link) => link.text && !/^\d+(\.\d+)*\.?$/.test(link.text) && text.includes(link.text))
      .map((link) => [`${link.text}\u0000${link.href}`, link])
  ).values()];

  let offset = 0;

  if (termPrefixLength > 0) {
    const strong = document.createElement('strong');
    strong.textContent = text.slice(0, termPrefixLength);
    paragraph.append(strong);
    offset = termPrefixLength;
  }

  while (offset < text.length) {
    let match = null;
    for (const link of candidates) {
      let index = text.indexOf(link.text, offset);
      while (index !== -1) {
        if (isWordBoundary(text, index, link.text.length)) {
          if (!match || index < match.index || (index === match.index && link.text.length > match.link.text.length)) {
            match = { index, link };
          }
          break;
        }
        index = text.indexOf(link.text, index + 1);
      }
    }

    if (!match) {
      paragraph.append(document.createTextNode(text.slice(offset)));
      return;
    }

    if (match.index > offset) {
      paragraph.append(document.createTextNode(text.slice(offset, match.index)));
    }
    const anchor = document.createElement('a');
    anchor.href = match.link.href;
    anchor.textContent = match.link.text;
    paragraph.append(anchor);
    offset = match.index + match.link.text.length;
  }
}

function sourceLinks(source) {
  const links = Array.from(source.querySelectorAll('a[href]'), (anchor) => ({
    text: anchor.textContent.replace(/\s+/g, ' ').trim(),
    href: anchor.href
  })).filter((link) => link.text);

  for (let index = 0; index < links.length - 1; index += 1) {
    const current = links[index];
    const next = links[index + 1];
    if (current.text === 'RFC' && /^\d+$/.test(next.text) && current.href === next.href) {
      links.push({ text: `RFC ${next.text}`, href: current.href });
    }
  }

  return links.filter((link) => !/^\d+(\.\d+)*\.?$/.test(link.text));
}

function renderBlock(block, index, settings, persistParagraphMode, persistTableMode) {
  if (block.kind === 'pagebreak') {
    const wrap = document.createElement('div');
    wrap.className = 'rev-pagebreak';
    if (!settings.page.showPageBreaks) {
      wrap.classList.add('rev-hidden');
    }
    wrap.title = `${block.footer} | ${block.header}`;
    const line = document.createElement('hr');
    wrap.append(line);
    return { node: wrap, exportBlock: block };
  }

  if (block.kind === 'paragraph') {
    const wrapper = document.createElement('div');
    wrapper.className = 'rev-paragraph-wrap';
    if (block.isDefinition) {
      wrapper.classList.add('rev-term');
    }
    if (block.isQuote) {
      wrapper.classList.add('rev-quote');
    }

    const p = document.createElement('p');
    const key = `p${index}`;
    const mode = settings.page.paragraphModes[key] ?? 'wrap';

    const group = document.createElement('div');
    group.className = 'rev-affordance-group';

    const buttonWrap = document.createElement('button');
    buttonWrap.type = 'button';
    buttonWrap.className = 'rev-affordance rev-paragraph-toggle';

    const buttonMono = document.createElement('button');
    buttonMono.type = 'button';
    buttonMono.className = 'rev-affordance rev-paragraph-mono-toggle';

    const applyParagraphMode = (curMode) => {
      p.replaceChildren();
      const isMono = curMode === 'mono';
      const isPre = curMode === 'prewrap';
      const textToRender = curMode === 'wrap' ? block.text : block.originalText;

      appendParagraphContent(p, textToRender, block.links ?? [], block);
      p.classList.toggle('rev-prewrap', isPre);
      p.classList.toggle('rev-pre-mono', isMono);

      buttonWrap.textContent = isPre ? '\u21B5' : '\u00B6';
      buttonWrap.title = isPre ? 'Rewrap paragraph' : 'Keep original line breaks';
      buttonWrap.setAttribute('aria-label', buttonWrap.title);

      buttonMono.textContent = isMono ? '\u2261' : '\u266F';
      buttonMono.title = isMono ? 'Show standard text' : 'Show original monospace whitespace';
      buttonMono.setAttribute('aria-label', buttonMono.title);
    };

    applyParagraphMode(mode);

    buttonWrap.addEventListener('click', async () => {
      const current = settings.page.paragraphModes[key] ?? 'wrap';
      const next = current === 'prewrap' ? 'wrap' : 'prewrap';
      settings.page.paragraphModes[key] = next;
      applyParagraphMode(next);
      await persistParagraphMode(key, next);
    });

    buttonMono.addEventListener('click', async () => {
      const current = settings.page.paragraphModes[key] ?? 'wrap';
      const next = current === 'mono' ? 'wrap' : 'mono';
      settings.page.paragraphModes[key] = next;
      applyParagraphMode(next);
      await persistParagraphMode(key, next);
    });

    group.append(buttonWrap, buttonMono);
    wrapper.append(group, p);
    return { node: wrapper, exportBlock: { ...block, exportText: mode === 'wrap' ? block.text : block.originalText } };
  }

  if (block.kind === 'table-pre') {
    const key = `t${index}`;
    const mode = settings.page.tableModes[key] ?? 'mono';
    const wrapper = document.createElement('div');
    wrapper.className = 'rev-table-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rev-affordance rev-table-toggle';

    const pre = document.createElement('pre');
    pre.textContent = block.text;

    const htmlRows = buildAsciiTableRows(block.lines ?? [block.text]);
    const renderMode = (nextMode) => {
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
        button.textContent = nextMode === 'mono' ? '\u25A6' : '\u2261';
        button.title = nextMode === 'mono' ? 'View as table' : 'View as monospace';
      } else {
        button.textContent = '\u2261';
        button.title = 'Monospace only';
        button.disabled = true;
      }
      button.setAttribute('aria-label', button.title);
    };

    button.addEventListener('click', async () => {
      const next = (settings.page.tableModes[key] ?? 'mono') === 'mono' ? 'table' : 'mono';
      settings.page.tableModes[key] = next;
      await persistTableMode(key, next);
      renderMode(next);
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
    btn.textContent = hidden ? '+' : '\u2212';
    btn.title = hidden ? 'Expand section' : 'Collapse section';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-expanded', String(!hidden));
  }
}

function hideOriginal(el) {
  if (el && !el.classList.contains(HIDDEN_CLASS)) {
    el.classList.add(HIDDEN_CLASS);
    state.hidden.push(el);
  }
}

// The site's own article column is pinned to a fixed narrow width, so mount
// outside it and let the toolbar's width control do the constraining.
function findMountHost(source) {
  return document.querySelector('main#main') || document.querySelector('main') || source.parentNode;
}

// The site paints its theme on ancestor elements; copy that exact color so our
// sticky toolbar and hover affordances don't sit on a mismatched panel.
function pageBackgroundColor(from) {
  let el = from;
  while (el && el !== document.documentElement) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0')) {
      return bg;
    }
    el = el.parentElement;
  }
  return getComputedStyle(document.documentElement).backgroundColor;
}

function blockHistogram(blocks) {
  return blocks.reduce((acc, block) => {
    acc[block.kind] = (acc[block.kind] ?? 0) + 1;
    return acc;
  }, {});
}

function scrollToAnchor(id) {
  if (!id || !state.root) {
    return;
  }
  const clean = id.replace(/^#/, '');
  const el =
    state.root.querySelector(`#${CSS.escape(`${ANCHOR_PREFIX}${clean}`)}`) ||
    state.root.querySelector(`#${CSS.escape(clean)}`);

  if (!el) {
    debugLog('anchor not found in enhanced content', { id: clean });
    return;
  }

  const section = el.closest('.rev-section');
  if (section) {
    collapseSection(section, false);
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function restore(reason) {
  if (!state.active && !state.root) {
    return;
  }
  state.hidden.forEach((el) => el.classList.remove(HIDDEN_CLASS));
  state.hidden = [];
  state.root?.remove();
  state.root = null;
  state.source = null;
  state.exportBlocks = [];
  state.applyWidth = null;
  state.active = false;
  debugLog('restored original page', { reason });
  reportStatus(true);
}

async function enhance(reason) {
  const source = document.querySelector('div.rfc-content');
  if (!source) {
    debugLog('no div.rfc-content on this page', { reason, url: location.href });
    return;
  }

  const settings = await getSettings();
  debugLog('settings loaded', {
    reason,
    enabled: settings.featureFlags.enabled,
    pageEnhanced: settings.page.enhanced,
    widthPreset: settings.page.widthPreset
  });

  await whenLoaded();
  await whenSettled(source);

  if (!source.isConnected) {
    debugLog('source detached while waiting for the page to settle');
    return;
  }

  const rawText = source.innerText;
  const blocks = parseRfcText(rawText, sourceLinks(source));
  const groups = groupedBlocks(blocks);
  debugLog('parsed rfc text', {
    chars: rawText.length,
    lines: rawText.split('\n').length,
    blocks: blocks.length,
    kinds: blockHistogram(blocks),
    groups: groups.length,
    headings: groups.filter((group) => group.heading).length
  });

  hideOriginal(source);

  const container = source.closest('.rfc-container');
  const tocNav = document.querySelector('nav[aria-label^="In this RFC"]');
  if (tocNav) {
    const sidebar = container ? Array.from(container.children).find((child) => child.contains(tocNav)) : null;
    hideOriginal(sidebar || tocNav);
  }
  debugLog('hid native chrome', {
    hiddenCount: state.hidden.length,
    foundContainer: Boolean(container),
    foundTocNav: Boolean(tocNav),
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  });

  const exportBlocks = [];
  const root = document.createElement('div');
  root.className = ROOT_CLASS;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Enhanced RFC content');

  const applyWidth = async () => {
    const fresh = await getSettings();
    const width = resolvedContentWidth(fresh);
    const background = pageBackgroundColor(root.parentElement);
    root.style.setProperty('--rev-width', width);
    root.style.setProperty('--rev-font', fresh.page.typeface || 'system-ui');
    root.style.setProperty('--rev-bg', background);
    debugLog('applied appearance', {
      width,
      background,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    });
  };

  let substituteNav = null;
  const toggleNav = () => {
    if (!substituteNav) {
      return;
    }
    const isHidden = substituteNav.classList.toggle('rev-hidden');
    toolbar.querySelector('.rev-nav-toggle')?.setAttribute('aria-expanded', String(!isHidden));
  };

  const toolbar = createToolbar(settings, applyWidth, toggleNav);
  root.append(toolbar);

  substituteNav = createSubstituteNav(groups, (targetId) => {
    scrollToAnchor(targetId);
    toggleNav();
  });
  toolbar.append(substituteNav);

  const persistParagraphMode = (key, mode) => savePageSettings({ paragraphModes: { [key]: mode } });
  const persistTableMode = (key, mode) => savePageSettings({ tableModes: { [key]: mode } });

  groups.forEach((group, groupIndex) => {
    const section = document.createElement('section');
    section.className = 'rev-section';
    section.dataset.sectionKey = `s${groupIndex}`;

    if (group.heading) {
      const h = document.createElement(`h${Math.max(1, Math.min(6, group.heading.level))}`);
      h.id = `${ANCHOR_PREFIX}${group.heading.id}`;
      h.textContent = group.heading.text;

      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'rev-affordance rev-section-toggle';
      collapse.setAttribute('aria-expanded', 'true');

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

    let currentUl = null;

    group.blocks.forEach((block, idx) => {
      const globalIdx = groupIndex * 10000 + idx;

      if (block.kind === 'paragraph' && block.isBullet) {
        if (!currentUl) {
          currentUl = document.createElement('ul');
          currentUl.className = 'rev-bullet-list';
          body.append(currentUl);
        }
        const li = document.createElement('li');
        const rendered = renderBlock(block, globalIdx, settings, persistParagraphMode, persistTableMode);
        li.append(rendered.node);
        currentUl.append(li);
        exportBlocks.push({ ...rendered.exportBlock, sectionKey: section.dataset.sectionKey });
        return;
      }

      currentUl = null;

      const rendered = renderBlock(block, globalIdx, settings, persistParagraphMode, persistTableMode);
      body.append(rendered.node);
      exportBlocks.push({ ...rendered.exportBlock, sectionKey: section.dataset.sectionKey });
    });

    section.append(body);
    collapseSection(section, Boolean(settings.page.collapsedSections[`s${groupIndex}`]));
    root.append(section);
  });

  const host = findMountHost(source);
  host.append(root);

  state.root = root;
  state.source = source;
  state.exportBlocks = exportBlocks;
  state.applyWidth = applyWidth;
  state.active = true;
  debugLog('rendered enhanced content', { host: host.tagName.toLowerCase(), sections: groups.length });

  root.addEventListener('click', (e) => {
    const href = e.target.closest('a[href^="#"]')?.getAttribute('href');
    if (href) {
      e.preventDefault();
      history.pushState(null, '', href);
      scrollToAnchor(href.slice(1));
    }
  });

  await applyWidth();
  if (location.hash) {
    setTimeout(() => scrollToAnchor(location.hash), 100);
  }

  reportStatus(true);
}

async function setSectionsCollapsed(collapsed) {
  if (!state.root) {
    return;
  }
  const updates = {};
  state.root.querySelectorAll('.rev-section').forEach((section) => {
    collapseSection(section, collapsed);
    updates[section.dataset.sectionKey] = collapsed;
  });
  await savePageSettings({ collapsedSections: updates });
}

async function copyExport(kind) {
  if (!state.exportBlocks.length) {
    debugLog('export requested with no enhanced content', { kind });
    return;
  }
  const latest = await getSettings();
  const payload = {
    title: document.title,
    sourceUrl: location.href,
    includeCollapsed: latest.page.includeCollapsedInExport,
    includePageBreaks: latest.page.includePageBreaksInExport,
    blocks: state.exportBlocks.map((block) => ({
      ...block,
      hidden: Boolean(latest.page.collapsedSections[block.sectionKey])
    }))
  };
  const text = kind === 'markdown' ? exportMarkdown(payload) : exportHtml(payload);
  await navigator.clipboard.writeText(text);
  debugLog('copied export to clipboard', { kind, chars: text.length });
}

async function toggle() {
  if (state.busy) {
    debugLog('toggle ignored while busy');
    return;
  }
  state.busy = true;
  try {
    if (state.active) {
      restore('user toggle');
      await savePageSettings({ enhanced: false });
    } else {
      await savePageSettings({ enhanced: true });
      await enhance('user toggle');
    }
  } finally {
    state.busy = false;
  }
  reportStatus(true);
}

async function runCommand(command) {
  debugLog('running command', { command, active: state.active });
  switch (command) {
    case 'rev.toggle':
      await toggle();
      return;
    case 'rev.collapseAll':
      await setSectionsCollapsed(true);
      return;
    case 'rev.expandAll':
      await setSectionsCollapsed(false);
      return;
    case 'rev.exportMarkdown':
      await copyExport('markdown');
      return;
    case 'rev.exportHtml':
      await copyExport('html');
      return;
    case 'rev.resetPage':
      await chrome.storage.local.remove(pageStorageKey(location.href));
      location.reload();
      return;
    case 'rev.resetAll': {
      const all = await chrome.storage.local.get(null);
      const pageKeys = Object.keys(all).filter((key) => key.startsWith(STORAGE_KEYS.PAGE_PREFIX));
      await chrome.storage.local.remove(pageKeys);
      location.reload();
      return;
    }
    default:
      debugLog('unknown command', { command });
  }
}

// Nuxt hydrates lazily and this is a single-page app, so the RFC body can appear,
// disappear, or be swapped long after our first attempt. Re-check on DOM churn
// instead of relying on a one-shot run at document_end.
async function reconcile(reason) {
  if (state.busy) {
    return;
  }
  state.busy = true;
  try {
    if (state.href !== location.href) {
      debugLog('url changed', { from: state.href, to: location.href });
      state.href = location.href;
      restore('navigation');
    }

    const settings = await getSettings();
    if (!settings.featureFlags.enabled || settings.page.enhanced === false) {
      restore('turned off');
      return;
    }

    if (state.active) {
      if (state.root?.isConnected && state.source?.isConnected) {
        return;
      }
      debugLog('enhanced content was removed by the page; rebuilding');
      restore('content lost');
    }

    if (document.querySelector('div.rfc-content')) {
      await enhance(reason);
    }
  } catch (error) {
    console.error('RFC Viewer failed to process this page', error);
    reportStatus(false);
  } finally {
    state.busy = false;
  }
}

function watchPage() {
  let timer;
  const schedule = (reason) => {
    clearTimeout(timer);
    timer = setTimeout(() => reconcile(reason), 300);
  };

  new MutationObserver(() => schedule('dom change')).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener('popstate', () => schedule('popstate'));
  window.addEventListener('hashchange', () => {
    if (state.active && location.hash) {
      scrollToAnchor(location.hash);
    }
  });

  new MutationObserver(() => state.applyWidth?.()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    if (changes[STORAGE_KEYS.GLOBAL] || changes[pageStorageKey(location.href)]) {
      state.applyWidth?.();
      schedule('settings change');
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (typeof message?.type === 'string' && message.type !== 'rev.status') {
    runCommand(message.type);
  }
  return false;
});

watchPage();
reconcile('startup');
