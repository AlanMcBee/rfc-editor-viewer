function sendToActiveTab(type) {
  chrome.runtime.sendMessage({ type: 'rev.activeTab' }, ({ tabId }) => {
    if (!tabId) {
      return;
    }
    chrome.tabs.sendMessage(tabId, { type });
  });
}

for (const [id, type] of Object.entries({
  copyMarkdown: 'rev.exportMarkdown',
  copyHtml: 'rev.exportHtml',
  collapseAll: 'rev.collapseAll',
  expandAll: 'rev.expandAll',
  resetPage: 'rev.resetPage',
  resetAll: 'rev.resetAll'
})) {
  document.getElementById(id)?.addEventListener('click', () => sendToActiveTab(type));
}
