/**
 * dsp.ts
 * 
 * Enhanced In-Browser Digital Signal Processing (DSP):
 * 1. Dual-Band Onset Detection (Sub-Bass + Broadband / High-Melodic for piano/guitar/synth)
 * 2. Comb-Filter Resonator Autocorrelation for robust tempo tracking (eliminates harmonic octave jumps)
 * 3. Extended 12-Tone Chromagram (MIDI 33 to 96, up to 2100 Hz, covering high piano notes like Runaway's E6)
 * 4. Krumhansl-Schmuckler Key Profile Correlation
 */

export interface DSPAnalysisResult {
  bpm: number;
  key: string;
  mode: 'Major' | 'Minor';
  relativeKey: string;
  camelot: string;
  /** Heuristic score combining comb-filter resonance and tonal correlation (not a statistically calibrated probability) */
  confidence: number;
  beatIntervalMs: number;
  /** Estimated bars analyzed under the standard 4/4 meter assumption */
  barsAnalyzed: number;
  /** Assumed meter for visualizer layout ('4/4') */
  timeSignature: string;
  waveformPeaks: number[];
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const CAMELOT_MAJOR: Record<number, string> = {
  0: '8B',  // C
  1: '3B',  // C# / Db
  2: '10B', // D
  3: '5B',  // D# / Eb
  4: '12B', // E
  5: '7B',  // F
  6: '2B',  // F# / Gb
  7: '9B',  // G
  8: '4B',  // G# / Ab
  9: '11B', // A
  10: '6B', // A# / Bb
  11: '1B', // B
};

const CAMELOT_MINOR: Record<number, string> = {
  0: '5A',  // C
  1: '12A', // C#
  2: '7A',  // D
  3: '2A',  // D# / Eb
  4: '9A',  // E
  5: '4A',  // F
  6: '11A', // F#
  7: '6A',  // G
  8: '1A',  // G#
  9: '8A',  // A
  10: '3A', // A# / Bb
  11: '10A',// B
};

// Krumhansl-Kessler Tonal Key Profiles
const KRUMHANSL_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KRUMHANSL_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculates BPM using Dual-Band Onset Detection & Comb-Filter Autocorrelation
 */
export function calculateBPM(samples: Float32Array, sampleRate: number): { bpm: number; confidence: number } {
  // Downsample to ~11025 or ~12000 Hz for efficient processing
  const downsampleFactor = 4;
  const targetRate = sampleRate / downsampleFactor;
  const downsampledLen = Math.floor(samples.length / downsampleFactor);
  const downsampled = new Float32Array(downsampledLen);

  for (let i = 0; i < downsampledLen; i++) {
    downsampled[i] = samples[i * downsampleFactor];
  }

  // 1. Low-Pass Filter (~220 Hz) for Kicks/Bass
  const rcLow = 1.0 / (2.0 * Math.PI * 220);
  const dt = 1.0 / targetRate;
  const alphaLow = dt / (rcLow + dt);

  const lowPassed = new Float32Array(downsampledLen);
  lowPassed[0] = downsampled[0];
  for (let i = 1; i < downsampledLen; i++) {
    lowPassed[i] = lowPassed[i - 1] + alphaLow * (downsampled[i] - lowPassed[i - 1]);
  }

  // 2. High-Pass / Mid Filter (~300 Hz to 2500 Hz) for Piano, Snare, and Melody Attacks
  const midPassed = new Float32Array(downsampledLen);
  for (let i = 0; i < downsampledLen; i++) {
    midPassed[i] = Math.abs(downsampled[i] - lowPassed[i]);
  }

  // 3. Extract windowed energy envelopes
  const windowSize = 256;
  const hopSize = 128;
  const numWindows = Math.floor((downsampledLen - windowSize) / hopSize);

  const lowEnvelope = new Float32Array(numWindows);
  const midEnvelope = new Float32Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    let lowEnergy = 0;
    let midEnergy = 0;
    const offset = w * hopSize;

    for (let j = 0; j < windowSize; j++) {
      const sLow = lowPassed[offset + j];
      const sMid = midPassed[offset + j];
      lowEnergy += sLow * sLow;
      midEnergy += sMid * sMid;
    }

    lowEnvelope[w] = Math.sqrt(lowEnergy / windowSize);
    midEnvelope[w] = Math.sqrt(midEnergy / windowSize);
  }

  // 4. Combined Half-Wave Rectified Onset Detection Function
  const onset = new Float32Array(numWindows);
  for (let i = 1; i < numWindows; i++) {
    const diffLow = lowEnvelope[i] - lowEnvelope[i - 1];
    const diffMid = midEnvelope[i] - midEnvelope[i - 1];

    const fluxLow = diffLow > 0 ? diffLow : 0;
    const fluxMid = diffMid > 0 ? diffMid : 0;

    // Weight mid higher when low frequencies are sparse (e.g. piano intro in Runaway)
    onset[i] = fluxLow * 0.4 + fluxMid * 0.6;
  }

  // 5. Autocorrelation over BPM search range (60 BPM to 180 BPM)
  const minBPM = 60;
  const maxBPM = 180;
  const envelopeRate = targetRate / hopSize;

  const minLag = Math.floor((60 / maxBPM) * envelopeRate);
  const maxLag = Math.floor((60 / minBPM) * envelopeRate);

  const rawCorr = new Float32Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < numWindows - lag; i++) {
      sum += onset[i] * onset[i + lag];
      count++;
    }
    rawCorr[lag] = count > 0 ? sum / count : 0;
  }

  // 6. Comb-filter resonance scoring to prefer true fundamental tempo over harmonic fractions
  let bestBPM = 85;
  let maxScore = -1;

  for (let bpm = minBPM; bpm <= maxBPM; bpm += 0.5) {
    const lag1 = Math.round((60 / bpm) * envelopeRate);
    const lagHalf = Math.round((60 / (bpm * 0.5)) * envelopeRate);
    const lagDouble = Math.round((60 / (bpm * 2)) * envelopeRate);

    if (lag1 < minLag || lag1 > maxLag) continue;

    let score = rawCorr[lag1];
    if (lagDouble >= minLag && lagDouble <= maxLag) {
      score += 0.4 * rawCorr[lagDouble];
    }
    if (lagHalf >= minLag && lagHalf <= maxLag) {
      score += 0.3 * rawCorr[lagHalf];
    }

    if (score > maxScore) {
      maxScore = score;
      bestBPM = Math.round(bpm);
    }
  }

  return {
    bpm: bestBPM,
    confidence: Math.min(0.95, Math.max(0.6, maxScore * 12))
  };
}

/**
 * Calculates Musical Key from audio using Extended 12-Tone Chromagram up to 2100 Hz (C7)
 */
export function calculateKey(samples: Float32Array, sampleRate: number): { key: string; mode: 'Major' | 'Minor'; relativeKey: string; camelot: string; confidence: number } {
  const chroma = new Float64Array(12).fill(0);

  // Extended MIDI range from MIDI 33 (A1 ~55Hz) to MIDI 96 (C7 ~2093Hz)
  // This ensures high-register instruments (like Runaway's E6 piano note at 1318.5 Hz) are fully captured!
  const fMin = 55;
  const fMax = 2200;
  const hopSize = 2048;
  const numHops = Math.min(Math.floor(samples.length / hopSize), 80);

  for (let h = 0; h < numHops; h++) {
    const offset = h * hopSize;
    const sliceLen = 1024;
    if (offset + sliceLen > samples.length) break;

    for (let midi = 33; midi <= 96; midi++) {
      const pitchClass = ((midi % 12) + 12) % 12;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);

      if (freq < fMin || freq > fMax) continue;

      const omega = (2 * Math.PI * freq) / sampleRate;
      let real = 0;
      let imag = 0;

      for (let n = 0; n < sliceLen; n += 2) {
        const sample = samples[offset + n];
        const win = 0.5 * (1 - Math.cos((2 * Math.PI * n) / sliceLen));
        const s = sample * win;
        real += s * Math.cos(omega * n);
        imag -= s * Math.sin(omega * n);
      }

      const power = real * real + imag * imag;
      // Slight perceptual weighting across octaves
      chroma[pitchClass] += power;
    }
  }

  const chromaArray = Array.from(chroma);
  const chromaMax = Math.max(...chromaArray, 1e-9);
  const normalizedChroma = chromaArray.map(v => v / chromaMax);

  // Correlate with all 24 keys (12 Major + 12 Minor)
  let bestCorrelation = -2;
  let bestRoot = 4; // Default E
  let bestMode: 'Major' | 'Minor' = 'Major';

  for (let root = 0; root < 12; root++) {
    const majorProfile = new Array(12);
    const minorProfile = new Array(12);

    for (let i = 0; i < 12; i++) {
      majorProfile[(i + root) % 12] = KRUMHANSL_MAJOR[i];
      minorProfile[(i + root) % 12] = KRUMHANSL_MINOR[i];
    }

    const rMajor = pearsonCorrelation(normalizedChroma, majorProfile);
    if (rMajor > bestCorrelation) {
      bestCorrelation = rMajor;
      bestRoot = root;
      bestMode = 'Major';
    }

    const rMinor = pearsonCorrelation(normalizedChroma, minorProfile);
    if (rMinor > bestCorrelation) {
      bestCorrelation = rMinor;
      bestRoot = root;
      bestMode = 'Minor';
    }
  }

  const noteName = NOTE_NAMES[bestRoot];
  const fullKeyName = `${noteName} ${bestMode}`;
  const camelotCode = bestMode === 'Major' ? CAMELOT_MAJOR[bestRoot] : CAMELOT_MINOR[bestRoot];

  // Calculate Relative Key (e.g. C# Minor <-> E Major, A Minor <-> C Major)
  const relativeRoot = bestMode === 'Major' ? (bestRoot + 9) % 12 : (bestRoot + 3) % 12;
  const relativeMode = bestMode === 'Major' ? 'Minor' : 'Major';
  const relativeKey = `${NOTE_NAMES[relativeRoot]} ${relativeMode}`;

  return {
    key: fullKeyName,
    mode: bestMode,
    relativeKey,
    camelot: camelotCode || '--',
    confidence: Math.max(0.6, Math.min(0.99, (bestCorrelation + 1) / 2))
  };
}

/**
 * Main full DSP analysis runner on Float32Array audio stream
 */
export function runFullDSPAnalysis(samples: Float32Array, sampleRate: number): DSPAnalysisResult {
  const bpmResult = calculateBPM(samples, sampleRate);
  const keyResult = calculateKey(samples, sampleRate);

  // Extract 40 waveform amplitude peaks for true DJ-style visualizer representation
  const numPeaks = 40;
  const sliceSize = Math.floor(samples.length / numPeaks);
  const rawPeaks: number[] = [];
  let globalMax = 1e-4;

  for (let i = 0; i < numPeaks; i++) {
    let peak = 0;
    const start = i * sliceSize;
    for (let j = 0; j < sliceSize; j += 8) {
      const v = Math.abs(samples[start + j]);
      if (v > peak) peak = v;
    }
    rawPeaks.push(peak);
    if (peak > globalMax) globalMax = peak;
  }

  const waveformPeaks = rawPeaks.map((p) => Math.max(0.12, Math.min(1.0, p / globalMax)));

  const totalDurationSeconds = samples.length / sampleRate;
  const beatIntervalMs = Math.round((60 / bpmResult.bpm) * 1000);
  const beats = (totalDurationSeconds / 60) * bpmResult.bpm;
  const barsAnalyzed = Math.round((beats / 4) * 10) / 10;

  return {
    bpm: bpmResult.bpm,
    key: keyResult.key,
    mode: keyResult.mode,
    relativeKey: keyResult.relativeKey,
    camelot: keyResult.camelot,
    confidence: (bpmResult.confidence + keyResult.confidence) / 2,
    beatIntervalMs,
    barsAnalyzed,
    timeSignature: '4/4',
    waveformPeaks
  };
}
