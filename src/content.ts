/**
 * content.ts
 * 
 * Enhanced song identification for YouTube.
 * Works across all YouTube watch page layouts, SPAs, and client-side rendering.
 */

interface SongDetectionResult {
  isSong: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  title?: string;
  artist?: string;
  videoId?: string;
}

let lastReportedVideoId = '';
let currentVideoDetectedSong = false;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let observer: MutationObserver | null = null;

let authoritativeTitle = '';
let authoritativeArtist = '';

/**
 * Gets current video ID from URL
 */
function getCurrentVideoId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

/**
 * Extracts current video title and channel name strictly from watch metadata
 */
function getVideoMetadataFromDOM(): { title: string; channelName: string } {
  const titleEl = document.querySelector(
    'ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata h1, #title h1 yt-formatted-string'
  );
  let title = titleEl?.textContent?.trim() || '';

  if (!title && document.title && document.title !== 'YouTube' && !document.title.startsWith('YouTube -')) {
    title = document.title.replace(/ - YouTube$/, '').trim();
  }

  // Meta title fallback
  if (!title) {
    const metaTitle = document.querySelector('meta[name="title"]')?.getAttribute('content');
    if (metaTitle && metaTitle !== 'YouTube') title = metaTitle;
  }

  if ((!title || title.toLowerCase() === 'youtube') && authoritativeTitle) {
    title = authoritativeTitle;
  }

  // Scrape channel strictly from owner elements to avoid sidebar recommendations or comments
  const channelEl = document.querySelector(
    'ytd-watch-metadata #owner #channel-name a, ytd-watch-metadata #channel-name a, #owner #channel-name a, ytd-video-owner-renderer #channel-name a, #upload-info #channel-name a'
  );
  let channelName = channelEl?.textContent?.trim() || '';

  // Check <link itemprop="name" content="..."> in head (available early)
  if (!channelName) {
    const headAuthor = document.querySelector('link[itemprop="name"]')?.getAttribute('content');
    if (headAuthor) channelName = headAuthor.trim();
  }

  // Check meta tag author
  if (!channelName) {
    const metaAuthor = document.querySelector('meta[name="author"]')?.getAttribute('content');
    if (metaAuthor) channelName = metaAuthor.trim();
  }

  if (!channelName && authoritativeArtist) {
    channelName = authoritativeArtist;
  }

  return { title, channelName };
}

/**
 * Validates whether the current page is a song using multiple DOM heuristics.
 */
function validateVideoDOM(): SongDetectionResult {
  const videoId = getCurrentVideoId() || '';
  const { title, channelName } = getVideoMetadataFromDOM();

  // If title is not yet available or is just "YouTube", do not falsely trigger
  if (!title || title.toLowerCase() === 'youtube') {
    return { isSong: false, confidence: 'low', reason: 'Awaiting watch page hydration', title: '', artist: '', videoId };
  }

  // 1. Meta Tag Check
  const categoryMeta = document.querySelector('meta[itemprop="genre"]');
  if (categoryMeta?.getAttribute('content')?.toLowerCase() === 'music') {
    return { isSong: true, confidence: 'high', reason: 'Category is "Music" (meta genre)', title, artist: channelName, videoId };
  }

  const ogTagMeta = document.querySelector('meta[property="og:video:tag"][content*="Music" i]');
  if (ogTagMeta) {
    return { isSong: true, confidence: 'high', reason: 'Music tag in og:video:tag', title, artist: channelName, videoId };
  }

  // 2. Official Artist Channel Badge Check
  // YouTube displays a music note icon badge next to verified music artists (e.g. Kanye West)
  const artistBadgeSelectors = [
    '.badge-style-type-verified-artist',
    '[badge-style-type*="ARTIST" i]',
    'ytd-channel-name [aria-label*="Artist" i]',
    '#channel-name [aria-label*="Artist" i]',
    '#owner [aria-label*="Official Artist" i]',
    'ytd-video-owner-renderer [aria-label*="Official Artist" i]',
    'ytd-channel-name [title*="Official Artist" i]',
    '#channel-name [title*="Official Artist" i]'
  ];

  for (const selector of artistBadgeSelectors) {
    if (document.querySelector(selector)) {
      return { isSong: true, confidence: 'high', reason: 'Official Artist Channel badge detected', title, artist: channelName, videoId };
    }
  }

  // Check tooltips in channel area for "Official Artist Channel"
  const channelTooltips = document.querySelectorAll(
    'ytd-channel-name tp-yt-paper-tooltip, #owner tp-yt-paper-tooltip, ytd-video-owner-renderer tp-yt-paper-tooltip, .yt-spec-tooltip'
  );
  for (const tooltip of Array.from(channelTooltips)) {
    if (tooltip.textContent?.toLowerCase().includes('artist channel')) {
      return { isSong: true, confidence: 'high', reason: 'Artist Channel tooltip detected', title, artist: channelName, videoId };
    }
  }

  // 3. Channel Name Heuristics (VEVO or Topic channels)
  if (channelName.endsWith('- Topic') || channelName.endsWith('VEVO') || channelName.toLowerCase().endsWith(' vevo')) {
    return { isSong: true, confidence: 'high', reason: `Music channel detected (${channelName})`, title, artist: channelName, videoId };
  }

  // 4. Chip Cloud Filters (e.g. "From Kanye West - Topic" or "Music" chips)
  const chips = document.querySelectorAll('yt-chip-cloud-chip-renderer');
  for (const chip of Array.from(chips)) {
    const chipText = chip.textContent?.trim() || '';
    if (chipText.includes('- Topic') || chipText === 'Music') {
      return { isSong: true, confidence: 'high', reason: `Music chip detected ("${chipText}")`, title, artist: channelName, videoId };
    }
  }

  // 5. Music Mix Playlist (RD prefix in playlist ID is auto-generated music radio)
  const urlParams = new URLSearchParams(window.location.search);
  const listId = urlParams.get('list');
  if (listId && (listId.startsWith('RD') || listId.startsWith('OLAK5uy_'))) {
    return { isSong: true, confidence: 'medium', reason: 'Music Mix/Album playlist detected (list=RD/OLAK)', title, artist: channelName, videoId };
  }

  // 6. Structured Description / Music Section
  const musicSection = document.querySelector(
    'ytd-video-description-music-section-renderer, ytd-music-responsive-list-item-renderer, ytd-video-description-infocards-section-renderer'
  );
  if (musicSection) {
    return { isSong: true, confidence: 'high', reason: 'YouTube Music section found in description', title, artist: channelName, videoId };
  }

  // Check description text for standard YouTube Music attribution
  const descriptionEl = document.querySelector('#description, ytd-text-inline-expander #plain-snippet-text, #description-inline-expander');
  const descText = descriptionEl?.textContent || '';
  if (
    descText.includes('Provided to YouTube by') ||
    descText.includes('Auto-generated by YouTube') ||
    descText.includes('Music in this video') ||
    (descText.includes('Song') && descText.includes('Licensed to YouTube by'))
  ) {
    return { isSong: true, confidence: 'high', reason: 'Music licensing metadata in description', title, artist: channelName, videoId };
  }

  // 7. Music Video Title Indicators
  const musicTitleRegex = /\b(official (music )?video|official audio|lyric video|visualizer|prod\.? by|feat\.?|ft\.?)\b/i;
  if (musicTitleRegex.test(title)) {
    return { isSong: true, confidence: 'medium', reason: 'Music keywords found in video title', title, artist: channelName, videoId };
  }

  return { isSong: false, confidence: 'low', reason: 'No music markers found', title, artist: channelName, videoId };
}

let lastReportedArtist = '';

/**
 * Communicates the detection result to the background script and logs to console.
 */
function reportResult(result: SongDetectionResult) {
  // Check if extension was reloaded/invalidated
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    if (retryTimer) clearInterval(retryTimer);
    return;
  }

  const currentVid = result.videoId || getCurrentVideoId() || '';

  // Prevent re-logging the exact same song detection repeatedly if artist and title haven't changed
  if (
    result.isSong &&
    currentVideoDetectedSong &&
    lastReportedVideoId === currentVid &&
    lastReportedArtist &&
    (!result.artist || result.artist === lastReportedArtist)
  ) {
    return;
  }

  if (result.isSong) {
    currentVideoDetectedSong = true;
    lastReportedVideoId = currentVid;
    if (result.artist) lastReportedArtist = result.artist;
    console.log(`[Musical Ext] 🎵 Song Detected: ${result.title || 'Unknown Title'} by ${result.artist || 'Unknown Artist'} (${result.reason})`);
  } else {
    // Only log if we are definitely on a watch page and finished retries
    if (window.location.href.includes('watch?v=' || '')) {
      console.log(`[Musical Ext] ❌ Not a song: ${result.reason}`);
    }
  }

  try {
    chrome.runtime.sendMessage({
      type: 'SONG_DETECTION_UPDATE',
      payload: result
    }).catch(() => {
      // Ignored if background worker is resting
    });
  } catch {
    // Suppress context invalidated errors when extension is reloaded
  }
}

/**
 * Runs detection with retries and DOM mutation monitoring.
 */
function startDetectionCycle() {
  const videoId = getCurrentVideoId();
  if (!videoId) return;

  if (videoId === lastReportedVideoId && currentVideoDetectedSong) {
    return;
  }

  currentVideoDetectedSong = false;
  console.log(`[Musical Ext] Video changed to ${videoId}. Running detection...`);

  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }

  // Immediate check
  const immediateResult = validateVideoDOM();
  if (immediateResult.isSong) {
    reportResult(immediateResult);
    return;
  }

  // Monitor DOM mutations and poll for up to 10 seconds while elements hydrate
  let attempts = 0;
  const maxAttempts = 20; // 20 * 500ms = 10s

  retryTimer = setInterval(() => {
    attempts++;
    const res = validateVideoDOM();

    if (res.isSong) {
      if (retryTimer) clearInterval(retryTimer);
      retryTimer = null;
      reportResult(res);
    } else if (attempts >= maxAttempts) {
      if (retryTimer) clearInterval(retryTimer);
      retryTimer = null;
      reportResult(res);
    }
  }, 500);
}

// Listen for messages from the MAIN world detector script (direct YouTube player API access)
window.addEventListener('message', (event) => {
  if (event.data?.type === 'MUSICAL_EXT_MAIN_WORLD_DATA') {
    const data = event.data.payload;
    const currentVid = getCurrentVideoId();

    if (data && data.videoId && (!currentVid || data.videoId === currentVid)) {
      if (data.title) authoritativeTitle = data.title;
      if (data.author) authoritativeArtist = data.author.replace(/\s*-\s*Topic$/i, '').trim();

      if (data.isMusic) {
        if (currentVideoDetectedSong && lastReportedVideoId === data.videoId && lastReportedArtist) {
          return; // Already recorded with artist
        }
        if (retryTimer) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
        reportResult({
          isSong: true,
          confidence: data.confidence || 'high',
          reason: data.reason || 'YouTube Player Category: Music',
          title: data.title,
          artist: data.author,
          videoId: data.videoId
        });
      }
    }
  }
});

// YouTube SPA navigation listener
window.addEventListener('yt-navigate-finish', () => {
  startDetectionCycle();
});

// Setup DOM observer for title / watch page updates
if (!observer) {
  observer = new MutationObserver(() => {
    const currentVid = getCurrentVideoId();
    if (currentVid && currentVid !== lastReportedVideoId && !currentVideoDetectedSong) {
      startDetectionCycle();
    }
  });

  const titleEl = document.querySelector('title');
  if (titleEl) {
    observer.observe(titleEl, { childList: true });
  }
}

// Initial run
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  startDetectionCycle();
} else {
  document.addEventListener('DOMContentLoaded', startDetectionCycle);
}
