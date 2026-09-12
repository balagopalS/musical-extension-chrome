/**
 * aiLore.ts
 * 
 * Provides AI-powered song backstory, lyrical meaning, and musical trivia.
 * Supports any OpenAI-compatible custom proxy or OpenRouter, local Ollama, and Tavily search.
 */

export interface AISettings {
  provider: 'proxy' | 'ollama';
  proxyUrl?: string; // e.g. "https://openrouter.ai/api/v1" or custom proxy
  apiKey?: string;
  model?: string;
  ollamaEndpoint?: string;
  ollamaModel?: string;
  tavilyApiKey?: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'proxy',
  proxyUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: 'meta-llama/llama-3.3-70b-instruct:free',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3',
};

/**
 * Searches Tavily for live musical context if API key is supplied
 */
async function fetchTavilyContext(query: string, apiKey?: string): Promise<string> {
  if (!apiKey) return '';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${query} song meaning backstory trivia`,
        search_depth: 'basic',
        max_results: 3
      })
    });
    if (res.ok) {
      const data = await res.json();
      return data.results?.map((r: any) => r.content).join('\n') || '';
    }
  } catch (err) {
    console.warn('[Musical Ext] Tavily search error:', err);
  }
  return '';
}

/**
 * Generates AI lore and background for a track
 */
export async function generateSongLore(
  title: string,
  artist: string,
  settings: AISettings
): Promise<string> {
  const songQuery = `${artist} - ${title}`;

  // Optional live web research via Tavily
  let searchContext = '';
  if (settings.tavilyApiKey) {
    searchContext = await fetchTavilyContext(songQuery, settings.tavilyApiKey);
  }

  const prompt = `You are an expert musicologist and music journalist.
Provide a concise, fascinating 2-3 paragraph breakdown of the song "${title}" by "${artist}".
Include:
1. Backstory & artistic inspiration (what motivated the artist, recording context)
2. Musical production & composition highlights (notable instruments, key samples, or beat structure)
3. Cultural impact or interesting trivia.

${searchContext ? `Additional web context:\n${searchContext}` : ''}
Keep your tone modern, engaging, and well-structured. Do not use generic filler.`;

  // 1. Custom Proxy or OpenRouter (OpenAI-compatible /chat/completions)
  if (settings.provider === 'proxy') {
    const baseUrl = (settings.proxyUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }
    if (baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://github.com/balagopalS/musical-extension-chrome';
      headers['X-Title'] = 'Musical Extension';
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.model || 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content.trim();
      } else {
        const errText = await res.text();
        return `⚠️ API Error (${res.status}): ${errText.slice(0, 150)}...\n\nCheck your API Key or Proxy URL in Settings.`;
      }
    } catch (err: any) {
      console.warn('[Musical Ext] AI Proxy fetch failed:', err);
      return `⚠️ Network/Connection Error: ${err.message || 'Failed to connect to proxy'}. Check endpoint URL.`;
    }
  }

  // 2. Local Ollama Provider
  if (settings.provider === 'ollama') {
    const endpoint = (settings.ollamaEndpoint || 'http://localhost:11434').replace(/\/+$/, '');
    try {
      const res = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.ollamaModel || 'llama3',
          prompt,
          stream: false
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.response) return data.response.trim();
      } else {
        return `⚠️ Ollama returned status ${res.status}. Make sure your model is pulled (e.g. 'ollama run ${settings.ollamaModel || 'llama3'}').`;
      }
    } catch (err: any) {
      console.warn('[Musical Ext] Ollama connection failed:', err);
      return `⚠️ Could not reach Ollama at ${endpoint}. Make sure Ollama is running locally.`;
    }
  }

  // 3. Fallback preview if neither configured
  return `🎵 **"${title}" by ${artist}**\n\n` +
    `• **Artistic Context:** This acclaimed track represents a defining milestone in ${artist}'s discography, showcasing deep emotional vulnerability coupled with innovative sound design.\n\n` +
    `• **Sonic Architecture:** Features dynamic chord progressions, deliberate dynamic range shifts, and nuanced rhythmic cadences that accentuate both melodic storytelling and percussive punch.\n\n` +
    `*(Tip: Add your API Key or custom Proxy URL in ⚙️ Settings to generate real-time AI breakdowns!)*`;
}
