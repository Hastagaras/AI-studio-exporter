// AI Studio ShareGPT Exporter - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.remove([
    'scrapeImages',
    'scrapeAttachments',
    'scrapeAttachmentPreview',
    'scrapeAttachmentTitle',
    'scrapeAttachmentSize'
  ]);
  console.log('AI Studio ShareGPT Exporter installed');
});

console.log('AI Studio ShareGPT Exporter background service worker loaded');
