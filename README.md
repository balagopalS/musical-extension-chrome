# Musical Extension: In-Browser Real-Time Audio DSP for YouTube

A Google Chrome Extension (Manifest V3) that detects music playing on YouTube, captures the audio through an Offscreen Document, and computes Beats Per Minute (BPM), musical key, Camelot notation, and waveform envelopes directly in the browser using client-side Digital Signal Processing (DSP).

---

## 1. System Architecture

Manifest V3 requires clean separation across browser environments:

```
[YouTube Tab (Page Context)]
      │
      ├─► detector.ts (MAIN world): Reads player response and YouTube player state
      │         │ (window.postMessage)
      │         ▼
      ├─► content.ts (ISOLATED world): Scrapes metadata and monitors page navigation
      │         │ (chrome.runtime.sendMessage)
      │         ▼
[Background Service Worker (background.ts)]
      │
      ├─► Obtains tab capture stream ID
      │
      ▼
[Offscreen Document (offscreen.html / offscreen.ts)]
      │
      ├─► Receives audio stream via Web Audio API
      ├─► Direct speaker pass-through: preserves audible tab playback
      ├─► Buffers 7 seconds of 32-bit audio samples
      └─► In-Browser DSP Engine (dsp.ts): Calculates BPM, Key, and Waveform Peaks
```

---

## 2. How the Audio Processing Works (Simplified DSP)

All calculations run in pure TypeScript without third-party audio libraries or server uploads. The process breaks down into four understandable steps:

### Step 1: Downsampling (Speeding up Processing)
- YouTube audio usually streams at 44,100 or 48,000 samples per second.
- To analyze tempo and musical pitch quickly without lagging the browser, the extension keeps every 4th sample (4x downsampling), bringing the audio to around 11,000 to 12,000 samples per second.
- This cuts processing time by 75% while keeping all musical frequencies needed for beat and key detection.

### Step 2: Finding the Beats (Dual-Band Transient Detection)
Not all songs rely on heavy bass drums. Some songs (like Kanye West's *Runaway*) start with high piano notes before any drum enters. To catch both:
1. **Low-Pass Filter (Bass & Kicks):** Separates sounds below 220 Hz (kick drums, basslines).
2. **Mid-Pass Filter (Melody & Snare):** Subtracts the bass from the main signal to isolate piano attacks, guitar strums, and snare hits.
3. **Energy Jump (Onset Detection):** The algorithm measures sudden increases in volume across short time windows. If energy suddenly jumps, it marks that point as a potential musical beat.

### Step 3: Calculating Tempo (Autocorrelation & Comb Filter)
- **Repeating Interval (Autocorrelation):** The algorithm slides the recorded beat pattern over itself across speeds between 60 BPM and 180 BPM. The delay interval where the beats line up most frequently indicates the tempo.
- **Harmonic Correction (Comb Filter):** Rhythms often repeat at double-speed (170 BPM) or half-speed (43 BPM). The algorithm scores both the primary tempo and its harmonic multiples (0.5x and 2x) to ensure it picks the true tempo rather than an octave error.

### Step 4: Finding the Musical Key (Chromagram & Key Matching)
1. **12 Musical Pitch Classes:** The algorithm tests frequencies across 5 octaves (MIDI notes 33 to 96, spanning 55 Hz to 2,100 Hz). This covers low bass notes up to high soprano piano keys (such as E6).
2. **Pitch Energy Profile:** All octaves of each note are folded into the 12 chromatic notes (C, C#, D, D#, E, F, F#, G, G#, A, A#, B). The notes with the highest energy form the song's musical fingerprint.
3. **Krumhansl-Schmuckler Profile Matching:** Music theory research defines standard templates for how often each note appears in Major and Minor scales. The algorithm compares the song's fingerprint against all 24 possible keys (12 Major and 12 Minor) using Pearson correlation. The key with the highest similarity score is chosen.
4. **Camelot & Relative Keys:** The detected key is converted to Camelot notation for DJ harmonic mixing (e.g., C# Minor = 12A, E Major = 12B) and derives its relative key.

---

## 3. Extension Modules

- **`src/detector.ts` (MAIN World):** Directly hooks into YouTube's player API to capture true video categories, channel author, and video ID.
- **`src/content.ts` (ISOLATED World):** Scrapes metadata from page headers and monitors YouTube navigation events (`yt-navigate-finish`).
- **`src/offscreen.ts` (Offscreen Document):** Captures tab audio using `chrome.tabCapture`, forwards the audio to speakers to prevent muting, buffers samples, and triggers analysis.
- **`src/dsp.ts` (DSP Engine):** Implements the downsampling, onset detection, autocorrelation, and tonal profile correlation algorithms.
- **`src/services/songInfo.ts`:** Queries the iTunes Search API with artist-title matching to retrieve release year, album details, and cover artwork.
- **`src/services/aiLore.ts`:** Generates song trivia and background meaning using OpenRouter, custom OpenAI-compatible proxies, or local Ollama instances.
- **`src/App.tsx`:** React interface displaying real-time audio waveforms, beat grid markers, key and BPM metrics, settings tabs, and a re-analysis button.

---

## 4. Installation & Build

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm

### Build Commands
```bash
# Install dependencies
npm install

# Compile TypeScript and bundle extension
npm run build
```

### Loading into Google Chrome
1. Open `chrome://extensions/` in Google Chrome.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `dist/` directory inside this project folder.
5. Open any YouTube music video and click the extension icon to view real-time analysis.

---

## 5. License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

