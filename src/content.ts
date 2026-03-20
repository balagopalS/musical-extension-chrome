console.log('Musical Extension content script loaded.');

function isSong(): boolean {
  const category = document.querySelector('meta[itemprop="genre"]')?.getAttribute('content');
  const hasMusicMetadata = !!document.querySelector('ytd-metadata-row-container-renderer');
  
  return category === 'Music' || hasMusicMetadata;
}

// Listen for YouTube navigation finish
window.addEventListener('yt-navigate-finish', () => {
  console.log('YouTube navigation finished. Checking if it is a song...');
  if (isSong()) {
    console.log('Detected a song! Ready for analysis.');
  } else {
    console.log('Not a music video.');
  }
});

// Initial check
if (isSong()) {
  console.log('Initial page is a song!');
}
