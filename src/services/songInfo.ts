/**
 * songInfo.ts
 * 
 * Fetches verified track metadata from public music databases (iTunes Search API).
 * Uses smart artist-matching to ensure it never returns covers or wrong artists.
 */

export interface PublicTrackMetadata {
  title: string;
  artist: string;
  album?: string;
  releaseYear?: string;
  genre?: string;
  artworkUrl?: string;
  source: 'iTunes' | 'YouTube';
}

/**
 * Clean up title (remove "(Official Video)", "ft.", etc. for cleaner search)
 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/[\(\[](official\s*(music\s*)?video|audio|lyrics?|visualizer|remaster(ed)?|hd|4k|video)[\)\]]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean up artist name (remove "- Topic", "VEVO", etc.)
 */
function cleanArtist(raw: string): string {
  return raw
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetches track metadata using iTunes public search API with smart artist matching
 */
export async function fetchPublicTrackInfo(rawTitle: string, rawArtist: string): Promise<PublicTrackMetadata | null> {
  const title = cleanTitle(rawTitle);
  const artist = cleanArtist(rawArtist);

  // If artist is completely missing or generic ("YouTube"), avoid blind single-word searches
  if (!artist || artist.toLowerCase() === 'youtube') {
    return {
      title: rawTitle,
      artist: rawArtist,
      source: 'YouTube'
    };
  }

  const query = `${artist} ${title}`.trim();

  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`;
    const res = await fetch(itunesUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.resultCount > 0 && Array.isArray(data.results)) {
        const results = data.results;
        const targetArtistLower = artist.toLowerCase();

        // 1. Find exact/best artist match and exclude cover/karaoke versions
        const bestMatch = results.find((item: any) => {
          const itemArtist = (item.artistName || '').toLowerCase();
          const itemTrack = (item.trackName || '').toLowerCase();
          const isArtistMatch = itemArtist.includes(targetArtistLower) || targetArtistLower.includes(itemArtist);
          const isCover = itemTrack.includes('epic version') || itemTrack.includes('tribute') || itemTrack.includes('karaoke') || itemTrack.includes('arr. for');
          return isArtistMatch && !isCover;
        }) || results.find((item: any) => {
          const itemArtist = (item.artistName || '').toLowerCase();
          return itemArtist.includes(targetArtistLower) || targetArtistLower.includes(itemArtist);
        }) || results[0];

        // Upgrade artwork to crisp 600x600
        const highResArt = bestMatch.artworkUrl100
          ? bestMatch.artworkUrl100.replace('100x100bb', '600x600bb')
          : undefined;

        const releaseYear = bestMatch.releaseDate ? new Date(bestMatch.releaseDate).getFullYear().toString() : undefined;

        return {
          title: bestMatch.trackName || rawTitle,
          artist: bestMatch.artistName || rawArtist,
          album: bestMatch.collectionName,
          releaseYear,
          genre: bestMatch.primaryGenreName,
          artworkUrl: highResArt,
          source: 'iTunes'
        };
      }
    }
  } catch (err) {
    console.warn('[Musical Ext] iTunes fetch error:', err);
  }

  return {
    title: rawTitle,
    artist: cleanArtist(rawArtist),
    source: 'YouTube'
  };
}
