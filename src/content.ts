/**
 * content.ts
 * 
 * Enhanced song identification for YouTube (2025/2026 update).
 * Handles SPA navigation, playlist radios, and dynamic metadata loading.
 */

interface SongDetectionResult {
  isSong: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Main validation function that runs various checks to determine if the video is a song.
 */
function validateVideo(): SongDetectionResult {
  // 1. Meta Tag Check (Category-based)
  // This is the most reliable "official" way to check category for SEO.
  const categoryMeta = document.querySelector('meta[itemprop="genre"]');
  const category = categoryMeta?.getAttribute('content');
  
  if (category === 'Music') {
    return { isSong: true, confidence: 'high', reason: 'Category is "Music" (via meta)' };
  }

  // 2. Raw HTML Category ID Check
  // Sometimes the meta tag is delayed, but the internal categoryId '10' is in the source.
  const pageSource = document.documentElement.innerHTML;
  if (pageSource.includes('"categoryId":"10"')) {
    return { isSong: true, confidence: 'high', reason: 'Category ID "10" found in page source' };
  }

  // 3. Structured Metadata Check (Description)
  // Official videos have a specific 'ytd-structured-description-content-renderer' for music.
  const musicSection = document.querySelector('ytd-structured-description-category-renderer');
  if (musicSection?.textContent?.includes('Music')) {
    return { isSong: true, confidence: 'high', reason: 'Music-specific section found in description' };
  }

  // 4. Channel Heuristics
  // Check for common markers like VEVO or the "Topic" channel suffix.
  const channelName = document.querySelector('#upload-info #channel-name a')?.textContent?.trim() || '';
  if (channelName.endsWith('VEVO') || channelName.endsWith('- Topic')) {
    return { isSong: true, confidence: 'medium', reason: 'Channel heuristics (VEVO/Topic)' };
  }

  // 5. Badge Check
  // Check for the "Official Artist Channel" badge (musical note icon).
  const hasArtistBadge = !!document.querySelector('.badge-style-type-verified-artist');
  if (hasArtistBadge) {
    return { isSong: true, confidence: 'medium', reason: 'Official Artist Channel badge detected' };
  }

  return { isSong: false, confidence: 'low', reason: 'No music markers found' };
}

/**
 * Communicates the detection result to the background script and logs to console.
 */
function reportResult(result: SongDetectionResult) {
  if (result.isSong) {
    console.log(`[Musical Ext] 🎵 Song Detected: ${result.reason} (Confidence: ${result.confidence})`);
  } else {
    // Only log if we are definitely on a watch page but failed detection
    if (window.location.href.includes('watch?v=')) {
      console.log(`[Musical Ext] ❌ Not a song: ${result.reason}`);
    }
  }

  chrome.runtime.sendMessage({
    type: 'SONG_DETECTION_UPDATE',
    payload: result
  });
}

/**
 * Central function to run detection with retries.
 * Necessary because YouTube loads metadata asynchronously after the URL changes.
 */
function runDetection(retries = 3) {
  const result = validateVideo();
  
  if (result.isSong || retries === 0) {
    reportResult(result);
  } else {
    // Retry in 1 second if not detected yet
    setTimeout(() => runDetection(retries - 1), 1000);
  }
}

// Track the current video ID to prevent duplicate analysis on non-video changes
let lastVideoId = '';

/**
 * YouTube's SPA navigation listener.
 */
window.addEventListener('yt-navigate-finish', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  
  if (videoId && videoId !== lastVideoId) {
    lastVideoId = videoId;
    console.log(`[Musical Ext] Video changed to ${videoId}. Running detection...`);
    runDetection();
  }
});

/**
 * Robust fallback: Observe changes to the title element.
 * This ensures we detect songs even if the custom events fail.
 */
const titleObserver = new MutationObserver(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  
  if (videoId && videoId !== lastVideoId) {
    lastVideoId = videoId;
    console.log(`[Musical Ext] Title change detected. Re-running detection...`);
    runDetection();
  }
});

// Start observing the title element once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const titleContainer = document.querySelector('title');
  if (titleContainer) {
    titleObserver.observe(titleContainer, { childList: true });
  }
  
  // Also run an initial check
  runDetection();
});

// Fallback for direct page loads where DOMContentLoaded might have already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  runDetection();
}
