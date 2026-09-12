/**
 * offscreen.ts
 * 
 * Runs in the offscreen document environment (DOM + Web Audio API).
 * Captures live tab audio, passes it to speakers, and buffers for DSP processing.
 */

import { runFullDSPAnalysis } from './dsp';

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let isCapturing = false;
let accumulatedSamples: Float32Array[] = [];
let totalSamplesRecorded = 0;
const SAMPLES_NEEDED_SECONDS = 7;

console.log('[Musical Ext Offscreen] Script initialized and listening.');

/**
 * Starts audio capture and analysis pipeline
 */
async function startCapture(streamId: string) {
  if (isCapturing) {
    stopCapture();
  }

  try {
    console.log('[Musical Ext Offscreen] Requesting tab audio with streamId:', streamId);

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      } as any,
      video: false
    });

    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(mediaStream);

    // CRITICAL: Route audio to speakers so user can still hear their music!
    source.connect(audioContext.destination);

    // Use ScriptProcessor for straightforward cross-context audio sample buffering
    const bufferSize = 4096;
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    
    accumulatedSamples = [];
    totalSamplesRecorded = 0;
    const targetSamples = audioContext.sampleRate * SAMPLES_NEEDED_SECONDS;
    isCapturing = true;

    scriptProcessor.onaudioprocess = (e) => {
      if (!isCapturing) return;

      const input = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input);
      accumulatedSamples.push(copy);
      totalSamplesRecorded += copy.length;

      // Calculate instantaneous RMS volume for live visualizer wave animation
      let sumSq = 0;
      for (let i = 0; i < copy.length; i += 8) {
        sumSq += copy[i] * copy[i];
      }
      const rms = Math.sqrt(sumSq / (copy.length / 8));
      const progressPercent = Math.min(100, Math.round((totalSamplesRecorded / targetSamples) * 100));

      // Emit live audio telemetry to popup
      chrome.runtime.sendMessage({
        type: 'AUDIO_STREAM_METRICS',
        payload: {
          volume: Math.min(1.0, rms * 4),
          progress: progressPercent,
          analyzing: true
        }
      }).catch(() => {});

      // When enough audio is sampled (~7 seconds), execute DSP calculation and release stream
      if (totalSamplesRecorded >= targetSamples) {
        isCapturing = false;
        processRecordedAudio();
        stopCapture();
      }
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    chrome.runtime.sendMessage({
      type: 'CAPTURE_STATUS',
      payload: { active: true, status: 'Sampling live audio...' }
    }).catch(() => {});

  } catch (err: any) {
    console.error('[Musical Ext Offscreen] Capture error:', err);
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      payload: { error: err.message || 'Failed to capture tab audio' }
    }).catch(() => {});
  }
}

/**
 * Combines buffered chunks and runs DSP analysis
 */
function processRecordedAudio() {
  if (!audioContext || accumulatedSamples.length === 0) return;

  console.log('[Musical Ext Offscreen] Processing audio buffer with DSP engine...');

  const totalLen = accumulatedSamples.reduce((acc, chunk) => acc + chunk.length, 0);
  const fullBuffer = new Float32Array(totalLen);
  let offset = 0;
  for (const chunk of accumulatedSamples) {
    fullBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  const sampleRate = audioContext.sampleRate;
  const dspResult = runFullDSPAnalysis(fullBuffer, sampleRate);

  console.log('[Musical Ext Offscreen] DSP Analysis complete:', dspResult);

  chrome.runtime.sendMessage({
    type: 'DSP_ANALYSIS_COMPLETE',
    payload: dspResult
  }).catch(() => {});
}

/**
 * Stops audio capture and frees hardware resources
 */
function stopCapture() {
  isCapturing = false;
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
  accumulatedSamples = [];
  totalSamplesRecorded = 0;

  chrome.runtime.sendMessage({
    type: 'CAPTURE_STATUS',
    payload: { active: false, status: 'Idle' }
  }).catch(() => {});
}

// Listen for commands from background service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_CAPTURE') {
    startCapture(message.streamId);
    sendResponse({ status: 'capturing' });
    return true;
  }

  if (message.type === 'STOP_CAPTURE') {
    stopCapture();
    sendResponse({ status: 'stopped' });
    return true;
  }

  return false;
});
