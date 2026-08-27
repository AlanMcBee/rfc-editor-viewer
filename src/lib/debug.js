// __REV_DEBUG__ is replaced at build time so release builds drop these calls entirely.
export const DEBUG = typeof __REV_DEBUG__ === 'undefined' ? false : __REV_DEBUG__;

export function debugLog(...args) {
  if (DEBUG) {
    console.debug('[RFC Viewer]', ...args);
  }
}
