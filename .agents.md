# Project Context & Agent Guidelines

## Repository Overview
`musical-extension-chrome` is a Google Chrome Extension (Manifest V3) that detects musical tracks on YouTube and performs client-side real-time Digital Signal Processing (DSP) to calculate Beats Per Minute (BPM), musical key, Camelot notation, and waveform amplitude envelopes.

## Architecture and Environments
1. **`src/detector.ts` (MAIN World):** Runs in YouTube page context. Hooks into `movie_player.getPlayerResponse()` and `window.ytInitialPlayerResponse` to extract video ID, category, author/artist, and title. Posts events to isolated content script via `window.postMessage`.
2. **`src/content.ts` (ISOLATED World):** Scrapes DOM metadata (`link[itemprop="name"]`, `meta[name="author"]`, `#channel-name`), listens for `yt-navigate-finish`, validates music category, and sends status to background service worker.
3. **`src/background.ts` (Service Worker):** Listens for song detection events, manages extension icon badge states, acquires tab audio capture IDs via `chrome.tabCapture.getMediaStreamId()`, and opens/maintains the offscreen document.
4. **`src/offscreen.ts` & `offscreen.html` (Offscreen Document):** Receives tab audio via `navigator.mediaDevices.getUserMedia`, routes to `audioContext.destination` so tab sound is preserved, buffers 7 seconds of Float32 PCM samples, and calls `runFullDSPAnalysis()`.
5. **`src/dsp.ts` (DSP Engine):**
   - Decimation downsampling (4x) to ~11025/12000 Hz.
   - Dual-band onset detection (220 Hz low-pass filter for sub-bass + broadband/mid transient flux for piano/melodic attacks).
   - Autocorrelation across 60–180 BPM with multi-harmonic comb-filter resonance scoring.
   - Extended chromagram (MIDI 33 to 96, up to 2100 Hz, covering high piano notes like E6).
   - Pearson correlation against 24 Krumhansl-Kessler tonal profiles for Major/Minor key detection and Camelot derivation.
6. **`src/services/songInfo.ts`:** iTunes Search API integration with fuzzy cleaning to avoid cover/wrong track metadata.
7. **`src/services/aiLore.ts`:** AI song trivia and background story via custom proxy/OpenRouter, local Ollama, and Tavily search.
8. **`src/App.tsx`:** Extension popup built with React + Vite + Tailwind CSS using the Coolors palette (`#110b11`, `#f2f4cb`, `#b7990d`, `#a5d0a8`, `#8cada7`).

## Build & Test Commands
- Build: `npm run build`
- Typecheck: `npx tsc --noEmit`
