# Gemini & LLM Agent Guidelines

## Architecture Summary
`musical-extension-chrome` is a real-time audio analysis Chrome Extension (Manifest V3) for YouTube.

Key components:
- `src/dsp.ts`: In-browser DSP algorithms for BPM (dual-band onset detection + comb-filter autocorrelation) and musical key (Hann-windowed chromagram up to 2100 Hz correlated with Krumhansl-Schmuckler profiles).
- `src/offscreen.ts`: Offscreen document capturing tab audio without muting speaker playback.
- `src/content.ts` & `src/detector.ts`: Dual-context YouTube metadata and music category detection.
- `src/background.ts`: Service worker managing stream lifecycle and extension status.
- `src/services/songInfo.ts`: Public iTunes Search API integration.
- `src/services/aiLore.ts`: AI lore generator supporting OpenRouter, custom proxy endpoints, Ollama, and Tavily.
- `src/App.tsx`: Dark-mode React popup interface themed with `#110b11`, `#f2f4cb`, `#b7990d`, `#a5d0a8`, `#8cada7`.

## Key Invariants
- Manifest V3 enforces separation: no DOM access in service worker; audio capture and processing must occur in offscreen document.
- Never terminate audio stream without calling `source.connect(audioContext.destination)`, otherwise tab audio is silenced.
- Release MediaStream tracks after sampling window to avoid "Cannot capture a tab with an active stream" errors on re-analysis.
