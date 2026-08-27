export const STORAGE_KEYS = {
  GLOBAL: 'rev.globalSettings',
  PAGE_PREFIX: 'rev.pageSettings:'
};

export const DEFAULT_SETTINGS = {
  featureFlags: {
    enabled: true,
    headingDetection: true,
    paragraphRewrap: true,
    sectionCollapse: true,
    tableEnhancement: true,
    pageBreakMarkers: true,
    exportTools: true
  },
  page: {
    widthPreset: '72ch',
    customWidth: '72ch',
    typeface: 'system-ui',
    includeCollapsedInExport: true,
    includePageBreaksInExport: false,
    collapsedSections: {},
    paragraphModes: {},
    tableModes: {}
  }
};

const WIDTH_PRESETS = new Set(['65ch', '72ch', '80ch', '56rem', '100%']);

export function pageStorageKey(url) {
  return `${STORAGE_KEYS.PAGE_PREFIX}${new URL(url).pathname}`;
}

export function normalizeCssWidth(value, fallback = '72ch') {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (WIDTH_PRESETS.has(trimmed)) {
    return trimmed;
  }

  if (/^\d+(\.\d+)?(ch|em|rem|px|vw|%)$/.test(trimmed)) {
    return trimmed;
  }

  return fallback;
}

export function mergeSettings(base, override) {
  return {
    featureFlags: {
      ...base.featureFlags,
      ...(override?.featureFlags ?? {})
    },
    page: {
      ...base.page,
      ...(override?.page ?? {}),
      widthPreset: override?.page?.widthPreset ?? base.page.widthPreset,
      customWidth: normalizeCssWidth(override?.page?.customWidth ?? base.page.customWidth),
      collapsedSections: {
        ...base.page.collapsedSections,
        ...(override?.page?.collapsedSections ?? {})
      },
      paragraphModes: {
        ...base.page.paragraphModes,
        ...(override?.page?.paragraphModes ?? {})
      },
      tableModes: {
        ...base.page.tableModes,
        ...(override?.page?.tableModes ?? {})
      }
    }
  };
}

export function resolvedContentWidth(settings) {
  if (settings.page.widthPreset === 'custom') {
    return normalizeCssWidth(settings.page.customWidth, DEFAULT_SETTINGS.page.customWidth);
  }

  return normalizeCssWidth(settings.page.widthPreset, DEFAULT_SETTINGS.page.widthPreset);
}
