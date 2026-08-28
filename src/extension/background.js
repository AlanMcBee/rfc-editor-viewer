chrome.action.onClicked.addListener((tab) => {
  if (typeof tab?.id === 'number') {
    chrome.tabs.sendMessage(tab.id, { type: 'rev.toggle' }).catch(() => {
      // No content script on this tab (non-RFC page or not yet injected).
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'rev.status') {
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number') {
      if (!message.ok) {
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#b00020' });
        chrome.action.setBadgeText({ tabId, text: '!' });
      } else if (message.active) {
        chrome.action.setBadgeText({ tabId, text: '' });
      } else {
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#6b7280' });
        chrome.action.setBadgeText({ tabId, text: 'off' });
      }
    }
  }

  if (message?.type === 'rev.activeTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tabId: tabs[0]?.id ?? null });
    });
    return true;
  }

  return false;
});
