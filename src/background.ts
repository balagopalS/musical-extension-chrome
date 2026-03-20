console.log('Musical Extension background script loaded.');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});
