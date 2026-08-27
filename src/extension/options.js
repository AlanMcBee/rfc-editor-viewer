import { DEFAULT_SETTINGS, STORAGE_KEYS, mergeSettings, normalizeCssWidth } from '../lib/settings.js';

const widthPresetEl = document.getElementById('widthPreset');
const customWidthEl = document.getElementById('customWidth');
const typefaceEl = document.getElementById('typeface');
const includeCollapsedInExportEl = document.getElementById('includeCollapsedInExport');
const includePageBreaksInExportEl = document.getElementById('includePageBreaksInExport');
const statusEl = document.getElementById('status');

const flagIds = ['enabled', 'headingDetection', 'paragraphRewrap', 'sectionCollapse', 'tableEnhancement', 'pageBreakMarkers', 'exportTools'];

async function load() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.GLOBAL);
  const settings = mergeSettings(DEFAULT_SETTINGS, data[STORAGE_KEYS.GLOBAL]);

  widthPresetEl.value = settings.page.widthPreset;
  customWidthEl.value = settings.page.customWidth;
  typefaceEl.value = settings.page.typeface;
  includeCollapsedInExportEl.checked = settings.page.includeCollapsedInExport;
  includePageBreaksInExportEl.checked = settings.page.includePageBreaksInExport;

  for (const id of flagIds) {
    document.getElementById(id).checked = Boolean(settings.featureFlags[id]);
  }
}

async function save() {
  const featureFlags = Object.fromEntries(flagIds.map((id) => [id, document.getElementById(id).checked]));

  const page = {
    widthPreset: widthPresetEl.value,
    customWidth: normalizeCssWidth(customWidthEl.value, DEFAULT_SETTINGS.page.customWidth),
    typeface: typefaceEl.value.trim() || DEFAULT_SETTINGS.page.typeface,
    includeCollapsedInExport: includeCollapsedInExportEl.checked,
    includePageBreaksInExport: includePageBreaksInExportEl.checked
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.GLOBAL]: { featureFlags, page } });
  statusEl.textContent = 'Saved.';
}

document.getElementById('save')?.addEventListener('click', save);
load().catch((error) => {
  console.error('RFC Viewer options failed to load', error);
  statusEl.textContent = 'Unable to load options.';
});
