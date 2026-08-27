chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'rev.status') {
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number') {
      if (message.ok) {
        chrome.action.setBadgeText({ tabId, text: '' });
      } else {
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#b00020' });
        chrome.action.setBadgeText({ tabId, text: '!' });
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
