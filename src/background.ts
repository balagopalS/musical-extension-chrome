/**
 * background.ts
 * 
 * Central service worker managing:
 * 1. Song detection state per tab
 * 2. Offscreen document lifecycle & chrome.tabCapture stream IDs
 * 3. Relaying DSP audio results to popup
 */

interface SongDetectionResult {
  isSong: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  title?: string;
  artist?: string;
  videoId?: string;
}

interface DSPResult {
  bpm: number;
  key: string;
  mode: 'Major' | 'Minor';
  camelot: string;
  confidence: number;
}

// Global detection & DSP cache
let currentDetectionState: (SongDetectionResult & { tabId?: number }) | null = null;
let currentDSPState: DSPResult | null = null;
let isAnalyzing = false;
let currentStreamMetrics = { volume: 0, progress: 0 };

console.log('[Musical Ext] Service worker loaded.');

/**
 * Ensures offscreen document is open
 */
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [
      chrome.offscreen.Reason.AUDIO_PLAYBACK,
      chrome.offscreen.Reason.USER_MEDIA
    ],
    justification: 'Capture and process YouTube tab audio for BPM and Key analysis'
  });
}

/**
 * Closes offscreen document
 */
async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });

  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

/**
 * Starts audio capture for active tab
 */
async function startAnalysisForTab(tabId: number) {
  try {
    isAnalyzing = true;
    currentStreamMetrics = { volume: 0, progress: 0 };
    currentDSPState = null;

    // Tell offscreen worker to release any previous active stream
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));

    await ensureOffscreenDocument();

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    // Send streamId to offscreen document
    chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      streamId,
      tabId
    });

    console.log('[Musical Ext] Sent streamId to offscreen worker:', streamId);
  } catch (err) {
    console.error('[Musical Ext] Error starting analysis:', err);
    isAnalyzing = false;
  }
}

/**
 * Stops audio capture
 */
async function stopAnalysis() {
  isAnalyzing = false;
  chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
  await closeOffscreenDocument();
}

/**
 * Message Dispatcher
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Content script song detection updates
  if (message.type === 'SONG_DETECTION_UPDATE') {
    const { payload } = message;
    currentDetectionState = {
      ...payload,
      tabId: sender.tab?.id
    };
    sendResponse({ status: 'success' });
    return true;
  }

  // 2. Popup queries detection & DSP state
  if (message.type === 'GET_DETECTION_STATE') {
    sendResponse({
      detection: currentDetectionState,
      dsp: currentDSPState,
      isAnalyzing,
      metrics: currentStreamMetrics
    });
    return true;
  }

  // 3. User clicks Start Analysis or Redo Analysis
  if (message.type === 'START_ANALYSIS' || message.type === 'REDO_ANALYSIS') {
    const targetTabId = message.tabId || currentDetectionState?.tabId;
    if (targetTabId) {
      if (isAnalyzing) {
        chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
      }
      currentDSPState = null;
      startAnalysisForTab(targetTabId);
      sendResponse({ status: 'starting' });
    } else {
      sendResponse({ status: 'error', reason: 'No active tab' });
    }
    return true;
  }

  // 4. User clicks Stop Analysis
  if (message.type === 'STOP_ANALYSIS') {
    stopAnalysis();
    sendResponse({ status: 'stopped' });
    return true;
  }

  // 5. Offscreen document emits live audio metrics
  if (message.type === 'AUDIO_STREAM_METRICS') {
    currentStreamMetrics = message.payload;
    return false;
  }

  // 6. Offscreen document completes DSP calculation
  if (message.type === 'DSP_ANALYSIS_COMPLETE') {
    currentDSPState = message.payload;
    isAnalyzing = false;
    console.log('[Musical Ext] Stored DSP results:', currentDSPState);
    return false;
  }

  return false;
});
