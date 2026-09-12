# Musical Extension: In-Browser Real-Time Audio DSP for YouTube

A Google Chrome Extension (Manifest V3) designed to detect musical content on YouTube, capture live audio via an Offscreen Document, and perform real-time Digital Signal Processing (DSP) to compute Beats Per Minute (BPM), musical key, Camelot wheel notation, and waveform envelopes directly in the browser without external audio processing APIs.

---

## 1. System Architecture

The extension executes within five distinct execution contexts under Manifest V3:

```
[YouTube Tab (Page Context)]
      │
      ├─► detector.ts (MAIN world): Reads window.ytInitialPlayerResponse & movie_player API
      │         │ (window.postMessage)
      │         ▼
      ├─► content.ts (ISOLATED world): DOM heuristics, meta tag parser, YouTube SPA listener
      │         │ (chrome.runtime.sendMessage)
      │         ▼
[Background Service Worker (background.ts)]
      │
      ├─► Dispatches chrome.tabCapture streamId
      │
      ▼
[Offscreen Document (offscreen.html / offscreen.ts)]
      │
      ├─► Web Audio API (AudioContext) receives stream via navigator.mediaDevices.getUserMedia
      ├─► Audio pass-through: source.connect(audioContext.destination) to preserve audible playback
      ├─► Float32 PCM sample accumulation (7-second analysis window)
      └─► In-Browser DSP Pipeline (dsp.ts): BPM, Key, Waveform Peak Extraction
```

---

## 2. Mathematical Formulations & DSP Pipeline

All digital signal processing algorithms are implemented in pure TypeScript (`src/dsp.ts`) operating directly over `Float32Array` single-precision audio buffers.

### 2.1 Preprocessing and Downsampling

Given an input audio buffer $x[n]$ sampled at $f_s$ (typically $44,100\text{ Hz}$ or $48,000\text{ Hz}$), the signal is decimation-downsampled by factor $M = 4$:

$$f_{\text{target}} = \frac{f_s}{M} \approx 11,025\text{ Hz} \quad \text{or} \quad 12,000\text{ Hz}$$

$$\tilde{x}[m] = x[m \cdot M]$$

This reduces the discrete Fourier and convolution search space while preserving the Nyquist frequency requirement for rhythmic transient detection ($f_{\text{target}} / 2 > 5,000\text{ Hz}$).

### 2.2 Dual-Band Onset Detection

To reliably identify transients across diverse musical arrangements—ranging from percussive sub-bass kicks to isolated high-register piano notes (such as the high E6 in Kanye West's *Runaway*)—the downsampled stream is separated into two spectral bands:

1. **Sub-Bass Band (Low-Pass Filter, $f_c = 220\text{ Hz}$):**
   Implemented as a first-order recursive IIR filter:
   
   $$\alpha = \frac{\Delta t}{RC + \Delta t}, \quad RC = \frac{1}{2\pi f_c}, \quad \Delta t = \frac{1}{f_{\text{target}}}$$
   
   $$y_{\text{low}}[m] = y_{\text{low}}[m-1] + \alpha (\tilde{x}[m] - y_{\text{low}}[m-1])$$

2. **Broadband / Transient Band:**
   Extracted via the absolute difference signal:
   
   $$y_{\text{mid}}[m] = |\tilde{x}[m] - y_{\text{low}}[m]|$$

3. **Energy Envelopes:**
   Calculated over sliding rectangular windows of size $N = 256$ with hop size $H = 128$:
   
   $$E_{\text{low}}[w] = \sqrt{\frac{1}{N} \sum_{j=0}^{N-1} y_{\text{low}}^2[wH + j]}$$
   
   $$E_{\text{mid}}[w] = \sqrt{\frac{1}{N} \sum_{j=0}^{N-1} y_{\text{mid}}^2[wH + j]}$$

4. **Half-Wave Rectified Spectral Flux:**
   
   $$\Delta E[w] = \max(0, E[w] - E[w-1])$$
   
   $$\text{ODF}[w] = 0.4 \cdot \Delta E_{\text{low}}[w] + 0.6 \cdot \Delta E_{\text{mid}}[w]$$

### 2.3 Tempo Extraction via Comb-Filter Autocorrelation

The Onset Detection Function $\text{ODF}[w]$ sampled at $f_{\text{env}} = f_{\text{target}} / H$ is correlated over lag intervals corresponding to 60 BPM through 180 BPM:

$$R[\tau] = \frac{1}{K - \tau} \sum_{w=0}^{K - 1 - \tau} \text{ODF}[w] \cdot \text{ODF}[w + \tau], \quad \tau \in [\tau_{\min}, \tau_{\max}]$$

Where:

$$\tau(B) = \left\lfloor \frac{60}{B} \cdot f_{\text{env}} \right\rfloor$$

To prevent octave-error traps (e.g., locking onto half-time or double-time harmonics), a multi-harmonic comb-filter resonance evaluator scores each candidate tempo $B$:

$$S(B) = R[\tau(B)] + 0.4 \cdot R[\tau(2B)] + 0.3 \cdot R\left[\tau\left(\frac{B}{2}\right)\right]$$

$$B_{\text{optimal}} = \arg\max_{B \in [60, 180]} S(B)$$

### 2.4 Musical Key Extraction via Extended Chromagram & Pearson Correlation

1. **Extended 12-Tone Pitch Class Profile (Chroma):**
   Spectral energy is accumulated across MIDI notes 33 ($A_1 \approx 55\text{ Hz}$) through 96 ($C_7 \approx 2,093\text{ Hz}$), ensuring soprano-register instruments are captured.
   For each MIDI note $m$, nominal frequency is:
   
   $$f(m) = 440 \cdot 2^{\frac{m - 69}{12}}$$
   
   Fourier power across window length $L = 1024$ weighted with a Hann window $w[n]$ is computed:
   
   $$X(f) = \sum_{n=0}^{L-1} x[n] \cdot \frac{1}{2}\left(1 - \cos\frac{2\pi n}{L}\right) e^{-j 2\pi f n / f_s}$$
   
   $$P(m) = |X(f(m))|^2$$
   
   The 12-dimensional chroma vector $\mathbf{C} \in \mathbb{R}^{12}$ sums power across all octaves for each pitch class $k \in [0, 11]$:
   
   $$C_k = \sum_{m \equiv k \pmod{12}} P(m), \quad \hat{\mathbf{C}} = \frac{\mathbf{C}}{\max_k C_k}$$

2. **Krumhansl-Schmuckler Key-Finding Algorithm:**
   Normalized chroma vector $\hat{\mathbf{C}}$ is evaluated against the 24 Krumhansl-Kessler tonal hierarchy profiles ($\mathbf{T}_{\text{major}}$ and $\mathbf{T}_{\text{minor}}$) circularly shifted by root pitch $r \in [0, 11]$.
   Similarity is quantified using the Pearson product-moment correlation coefficient:
   
   $$r(\hat{\mathbf{C}}, \mathbf{T}) = \frac{\sum_{i=0}^{11} (\hat{C}_i - \bar{C})(T_i - \bar{T})}{\sqrt{\sum_{i=0}^{11} (\hat{C}_i - \bar{C})^2 \sum_{i=0}^{11} (T_i - \bar{T})^2}}$$

   The key and mode corresponding to $\max r(\hat{\mathbf{C}}, \mathbf{T}_{r, \text{mode}})$ are selected.

3. **Harmonic Notation & Relative Keys:**
   - Camelot Wheel notation is derived ($1A-12A$ for Minor, $1B-12B$ for Major).
   - Relative tonality is calculated ($r_{\text{rel}} = (r + 9) \pmod{12}$ for Major; $r_{\text{rel}} = (r + 3) \pmod{12}$ for Minor).

---

## 3. Extension Component Details

- **`src/detector.ts` (MAIN World):** Runs directly in YouTube's execution context. Intercepts `movie_player.getPlayerResponse()` and `window.ytInitialPlayerResponse` to extract authoritative video categories, video IDs, titles, and channel authors.
- **`src/content.ts` (Isolated World):** Monitors DOM state and YouTube SPA navigation events (`yt-navigate-finish`). Gathers early `<head>` metadata (`link[itemprop="name"]`, `meta[name="author"]`) and verifies music badges. Relays detected track states to background service workers.
- **`src/offscreen.ts` (Offscreen Document):** Manages tab audio streams via `chrome.tabCapture.getMediaStreamId()`. Buffers single-channel 32-bit floating-point audio data while streaming directly to `audioContext.destination` to prevent muting.
- **`src/services/songInfo.ts`:** Fetches supplementary release metadata, album names, and artwork using the public iTunes Search API with strict artist-title matching heuristics.
- **`src/services/aiLore.ts`:** Provides AI song analysis and background narratives via customizable OpenAI-compatible endpoints, OpenRouter, or local Ollama instances with optional Tavily contextual search.
- **`src/App.tsx`:** React interface rendered with Tailwind CSS. Includes real-time waveform visualization, beat-grid markers, key and BPM metrics, settings tabs, and manual re-analysis triggers.

---

## 4. Installation & Build

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm

### Build Commands
```bash
# Install dependencies
npm install

# Compile TypeScript and bundle extension via Vite
npm run build
```

### Loading into Google Chrome
1. Navigate to `chrome://extensions/` in Google Chrome.
2. Enable **Developer mode** via the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `dist/` directory located within this repository.
5. Open any YouTube video to begin detection and analysis.
