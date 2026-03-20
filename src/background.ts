/**
 * background.ts
 * 
 * Handles the communication between content scripts, the popup, and the audio capture engine.
 */

interface SongDetectionResult {
  isSong: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// Global state to store the current detection status
let currentDetectionState: SongDetectionResult | null = null;

console.log('[Musical Ext] Background script loaded and listening for events.');

/**
 * Listen for messages from content scripts (src/content.ts).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SONG_DETECTION_UPDATE') {
    const { payload, tabId } = message;
    currentDetectionState = payload;

    if (payload.isSong) {
      console.log(`[Musical Ext] Song detected in tab ${sender.tab?.id}. Reason: ${payload.reason}`);
      // Proceed to initialize Phase 2 logic (Audio Capture) here in the future
    } else {
      console.log(`[Musical Ext] Video in tab ${sender.tab?.id} is NOT a song.`);
    }
  }

  // Acknowledge receipt of the message
  sendResponse({ status: 'success' });
  return true; // Keep the message channel open for async response if needed
});

/**
 * Handle extension install or update logic.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Musical Ext] Extension successfully installed/updated.');
});
