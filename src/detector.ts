/**
 * detector.ts
 * 
 * Runs in the MAIN world (same JavaScript context as YouTube).
 * Directly accesses YouTube's internal player API and player responses.
 */

function extractYouTubePlayerData() {
  try {
    const player = document.getElementById('movie_player') as any;
    let playerResponse: any = null;

    if (player && typeof player.getPlayerResponse === 'function') {
      playerResponse = player.getPlayerResponse();
    }

    if (!playerResponse && (window as any).ytInitialPlayerResponse) {
      playerResponse = (window as any).ytInitialPlayerResponse;
    }

    if (!playerResponse) {
      const flexy = document.querySelector('ytd-watch-flexy') as any;
      if (flexy && flexy.playerData) {
        playerResponse = flexy.playerData;
      }
    }

    if (!playerResponse) return null;

    const microformat = playerResponse.microformat?.playerMicroformatRenderer;
    const videoDetails = playerResponse.videoDetails;

    const category = (microformat?.category || '').trim();
    const categoryId = 
      playerResponse.playerConfig?.mediaCommonConfig?.dynamicReadaheadConfig?.categoryId ||
      microformat?.categoryId ||
      '';
      
    const isMusicCategory = category.toLowerCase() === 'music' || categoryId === '10' || categoryId === 10;
    const isMusicType = !!videoDetails?.musicVideoType;
    
    // Get channel name from videoDetails or player API
    let author = (videoDetails?.author || player?.getVideoData?.()?.author || '').trim();
    author = author.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();

    const title = (videoDetails?.title || player?.getVideoData?.()?.title || '').trim();
    const videoId = videoDetails?.videoId || player?.getVideoData?.()?.video_id || '';

    const hasMusicMetadata = 
      isMusicCategory || 
      isMusicType || 
      category === 'Music';

    if (!videoId) return null;

    return {
      videoId,
      title,
      author,
      category,
      isMusic: hasMusicMetadata,
      confidence: hasMusicMetadata ? 'high' : 'low',
      reason: hasMusicMetadata ? `YouTube Player category: "${category || 'Music'}"` : 'Player indicates non-music'
    };
  } catch {
    return null;
  }
}

let lastNotifiedVideoId = '';

function notifyDetection(force = false) {
  const data = extractYouTubePlayerData();
  if (data && data.videoId) {
    if (!force && data.videoId === lastNotifiedVideoId && data.isMusic) {
      return; // Already notified for this video
    }
    lastNotifiedVideoId = data.videoId;
    window.postMessage({
      type: 'MUSICAL_EXT_MAIN_WORLD_DATA',
      payload: data
    }, '*');
  }
}

// Listen to YouTube's SPA navigation and player events
window.addEventListener('yt-navigate-finish', (event: any) => {
  notifyDetection();
  
  const response = event?.detail?.response;
  if (response) {
    try {
      const playerResponse = response.playerResponse;
      if (playerResponse) {
        const cat = playerResponse.microformat?.playerMicroformatRenderer?.category;
        const details = playerResponse.videoDetails;
        if (cat?.toLowerCase() === 'music' || details?.musicVideoType) {
          window.postMessage({
            type: 'MUSICAL_EXT_MAIN_WORLD_DATA',
            payload: {
              videoId: details?.videoId,
              title: details?.title,
              author: details?.author,
              category: cat,
              isMusic: true,
              confidence: 'high',
              reason: `yt-navigate-finish playerResponse: "${cat || 'Music'}"`
            }
          }, '*');
        }
      }
    } catch {
      // Ignored
    }
  }

  // Poll while YouTube initializes the video player
  let count = 0;
  const interval = setInterval(() => {
    notifyDetection();
    count++;
    if (count > 8) clearInterval(interval);
  }, 400);
});

// Check when navigation finishes or video elements update
window.addEventListener('yt-player-updated', () => notifyDetection());
window.addEventListener('yt-page-data-updated', () => notifyDetection());

// Initial trigger
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  notifyDetection(true);
} else {
  window.addEventListener('DOMContentLoaded', () => notifyDetection(true));
}
