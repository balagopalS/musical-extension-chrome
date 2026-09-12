import { useState, useEffect } from 'react'
import { fetchPublicTrackInfo, PublicTrackMetadata } from './services/songInfo'
import { generateSongLore, DEFAULT_AI_SETTINGS, AISettings } from './services/aiLore'

interface SongDetectionResult {
  isSong: boolean
  confidence: 'high' | 'medium' | 'low'
  reason: string
  title?: string
  artist?: string
  videoId?: string
}

interface DSPResult {
  bpm: number
  key: string
  mode: 'Major' | 'Minor'
  relativeKey: string
  camelot: string
  confidence: number
  beatIntervalMs: number;
  barsAnalyzed: number;
  timeSignature: string;
  waveformPeaks: number[];
}

function App() {
  const [activeTab, setActiveTab] = useState<'dsp' | 'info' | 'settings'>('dsp')
  const [detection, setDetection] = useState<SongDetectionResult | null>(null)
  const [dspResult, setDspResult] = useState<DSPResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [streamMetrics, setStreamMetrics] = useState({ volume: 0, progress: 0 })
  const [publicMeta, setPublicMeta] = useState<PublicTrackMetadata | null>(null)
  const [aiLore, setAiLore] = useState<string>('')
  const [loadingLore, setLoadingLore] = useState(false)

  // AI Configuration Settings
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const saved = localStorage.getItem('musical_ext_ai_settings')
    return saved ? JSON.parse(saved) : DEFAULT_AI_SETTINGS
  })

  // Synchronize state with background service worker
  useEffect(() => {
    chrome.runtime?.sendMessage?.({ type: 'GET_DETECTION_STATE' }, (res) => {
      if (res) {
        if (res.detection) setDetection(res.detection)
        if (res.dsp) setDspResult(res.dsp)
        if (res.isAnalyzing !== undefined) setIsAnalyzing(res.isAnalyzing)
        if (res.metrics) setStreamMetrics(res.metrics)
      }
    })

    const listener = (message: any) => {
      if (message.type === 'SONG_DETECTION_UPDATE') {
        setDetection(message.payload)
      }
      if (message.type === 'DSP_ANALYSIS_COMPLETE') {
        setDspResult(message.payload)
        setIsAnalyzing(false)
      }
      if (message.type === 'AUDIO_STREAM_METRICS') {
        setStreamMetrics(message.payload)
      }
      if (message.type === 'CAPTURE_STATUS') {
        setIsAnalyzing(message.payload.active)
      }
    }

    chrome.runtime?.onMessage?.addListener(listener)
    return () => {
      chrome.runtime?.onMessage?.removeListener(listener)
    }
  }, [])

  // When a new song is detected, auto-fetch public metadata and initial lore
  useEffect(() => {
    if (detection?.isSong && detection.title) {
      fetchPublicTrackInfo(detection.title, detection.artist || '').then((meta) => {
        setPublicMeta(meta)
      })
    }
  }, [detection?.title, detection?.artist])

  // Fetch AI Lore
  const handleGenerateLore = async () => {
    if (!detection?.title) return
    setLoadingLore(true)
    try {
      const lore = await generateSongLore(detection.title, detection.artist || '', aiSettings)
      setAiLore(lore)
    } finally {
      setLoadingLore(false)
    }
  }

  // Toggle DSP audio analysis
  const toggleAnalysis = () => {
    if (isAnalyzing) {
      chrome.runtime?.sendMessage?.({ type: 'STOP_ANALYSIS' })
      setIsAnalyzing(false)
    } else {
      chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0]
        if (activeTab?.id) {
          chrome.runtime?.sendMessage?.({ type: 'START_ANALYSIS', tabId: activeTab.id })
          setIsAnalyzing(true)
        }
      })
    }
  }

  const saveSettings = (newSettings: AISettings) => {
    setAiSettings(newSettings)
    localStorage.setItem('musical_ext_ai_settings', JSON.stringify(newSettings))
  }

  return (
    <div className="w-[360px] min-h-[520px] bg-[#110b11] text-[#f2f4cb] font-sans p-4 select-none relative overflow-hidden flex flex-col justify-between">
      {/* Background ambient warm glows matching the palette */}
      <div className="absolute -top-12 -left-12 w-44 h-44 bg-[#a5d0a8]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-12 w-48 h-48 bg-[#b7990d]/10 rounded-full blur-3xl pointer-events-none" />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3.5 relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#b7990d] to-[#a5d0a8] flex items-center justify-center shadow-lg shadow-[#b7990d]/20">
              <span className="text-xs text-[#110b11]">🎵</span>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-[#f2f4cb] flex items-center gap-1.5 font-mono">
                Musical Ext <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#b7990d]/20 text-[#b7990d] border border-[#b7990d]/30 font-sans">2026</span>
              </h1>
            </div>
          </div>

          {detection?.isSong && (
            <span className="text-[10px] bg-[#a5d0a8]/15 text-[#a5d0a8] border border-[#a5d0a8]/35 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a5d0a8] animate-ping" />
              Verified Song
            </span>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex p-1 bg-[#1a121a] border border-[#2e202e] rounded-xl mb-3.5 backdrop-blur-md relative z-10">
          <button
            onClick={() => setActiveTab('dsp')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'dsp'
                ? 'bg-[#b7990d]/20 text-[#f2f4cb] border border-[#b7990d]/40 shadow-sm'
                : 'text-[#8cada7] hover:text-[#f2f4cb]'
            }`}
          >
            <span>🎛️</span> DSP Audio
          </button>
          <button
            onClick={() => {
              setActiveTab('info')
              if (!aiLore && detection?.title) handleGenerateLore()
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'info'
                ? 'bg-[#a5d0a8]/20 text-[#f2f4cb] border border-[#a5d0a8]/40 shadow-sm'
                : 'text-[#8cada7] hover:text-[#f2f4cb]'
            }`}
          >
            <span>📖</span> Song Lore
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-9 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center ${
              activeTab === 'settings'
                ? 'bg-[#2e202e] text-[#b7990d] border border-[#b7990d]/40'
                : 'text-[#8cada7] hover:text-[#f2f4cb]'
            }`}
            title="AI & API Settings"
          >
            ⚙️
          </button>
        </div>

        {/* TAB 1: DSP AUDIO ANALYSIS */}
        {activeTab === 'dsp' && (
          <div className="space-y-3 relative z-10">
            {/* Track Info Card */}
            <div className="bg-[#1c141c]/90 border border-[#2e202e] rounded-xl p-3 backdrop-blur-md shadow-xl">
              <div className="flex items-center justify-between text-[10px] text-[#8cada7] mb-1">
                <span className="uppercase font-mono tracking-wider">Current Track</span>
                <span className="text-[#b7990d] truncate max-w-[150px] font-mono">{detection?.reason || 'Awaiting video'}</span>
              </div>
              <h2 className="text-sm font-semibold text-[#f2f4cb] truncate" title={detection?.title}>
                {detection?.title || 'No YouTube Video Detected'}
              </h2>
              <p className="text-xs text-[#8cada7] truncate mt-0.5 font-medium">
                {detection?.artist || publicMeta?.artist || (detection?.isSong ? 'YouTube Channel' : 'Open a YouTube music tab to begin')}
              </p>
            </div>

            {/* Audio Waveform & Beat Grid Display */}
            <div className="bg-[#181118]/80 border border-[#2e202e] rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden min-h-24">
              <div className="flex items-end justify-center gap-1 h-14 w-full px-2">
                {dspResult?.waveformPeaks ? (
                  dspResult.waveformPeaks.map((peak, i) => {
                    const isBeatTick = i % 4 === 0;
                    return (
                      <div
                        key={i}
                        style={{ height: `${Math.max(6, Math.round(peak * 48))}px` }}
                        className={`flex-1 rounded-sm transition-all ${
                          isBeatTick
                            ? 'bg-[#b7990d] shadow-sm shadow-[#b7990d]/80 ring-1 ring-[#f2f4cb]/60'
                            : 'bg-gradient-to-t from-[#8cada7]/60 to-[#a5d0a8]'
                        }`}
                        title={`Beat Slice ${i + 1}`}
                      />
                    );
                  })
                ) : (
                  [...Array(24)].map((_, i) => {
                    const baseHeight = isAnalyzing
                      ? Math.max(8, Math.sin(i * 0.5 + Date.now() * 0.006) * 44 * (streamMetrics.volume + 0.3))
                      : 6;
                    return (
                      <div
                        key={i}
                        style={{ height: `${baseHeight}px` }}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          isAnalyzing
                            ? 'bg-gradient-to-t from-[#b7990d] via-[#8cada7] to-[#a5d0a8] shadow-sm shadow-[#a5d0a8]/40'
                            : 'bg-[#2e202e]'
                        }`}
                      />
                    );
                  })
                )}
              </div>

              {isAnalyzing && (
                <div className="w-full mt-2">
                  <div className="flex justify-between text-[10px] text-[#8cada7] mb-1 font-mono">
                    <span>Recording waveform & beats...</span>
                    <span>{streamMetrics.progress}%</span>
                  </div>
                  <div className="w-full h-1 bg-[#110b11] rounded-full overflow-hidden border border-[#2e202e]">
                    <div
                      className="h-full bg-gradient-to-r from-[#b7990d] to-[#a5d0a8] transition-all duration-200"
                      style={{ width: `${streamMetrics.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {!isAnalyzing && !dspResult && (
                <p className="text-[10px] text-[#8cada7]/70 font-mono mt-1">Press Start to capture & build waveform</p>
              )}
              {!isAnalyzing && dspResult && (
                <div className="w-full mt-2 pt-1 border-t border-[#2e202e] flex items-center justify-between text-[10px] font-mono text-[#a5d0a8]">
                  <span>Beat Grid: {dspResult.timeSignature || '4/4'} ({dspResult.barsAnalyzed || 2.5} bars)</span>
                  <span className="text-[#b7990d]">IBI: {dspResult.beatIntervalMs || 700}ms</span>
                </div>
              )}
            </div>

            {/* Metrics Display Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* BPM Box */}
              <div className="bg-[#1c141c]/90 border border-[#2e202e] rounded-xl p-3 relative overflow-hidden">
                <div className="text-[10px] text-[#8cada7] font-mono uppercase tracking-wider">Tempo (BPM)</div>
                <div className="text-2xl font-black text-[#b7990d] mt-1 font-mono">
                  {dspResult ? dspResult.bpm : isAnalyzing ? '...' : '--'}
                </div>
                <div className="text-[10px] text-[#8cada7] mt-0.5">
                  {dspResult ? (dspResult.bpm < 90 ? 'Slow / Groove' : dspResult.bpm < 130 ? 'Midtempo' : 'Uptempo') : 'Dual-band Onset'}
                </div>
              </div>

              {/* Key Box */}
              <div className="bg-[#1c141c]/90 border border-[#2e202e] rounded-xl p-3 relative overflow-hidden">
                <div className="text-[10px] text-[#8cada7] font-mono uppercase tracking-wider">Musical Key</div>
                <div className="text-2xl font-black text-[#a5d0a8] mt-1 truncate" title={dspResult?.key}>
                  {dspResult ? dspResult.key : isAnalyzing ? '...' : '--'}
                </div>
                <div className="text-[10px] text-[#8cada7] mt-0.5 flex flex-col gap-0.5">
                  <span className="truncate">{dspResult?.relativeKey ? `Rel: ${dspResult.relativeKey}` : 'Chromagram (C7)'}</span>
                  <span className="text-[#b7990d] font-mono text-[9px]">{dspResult ? `Camelot ${dspResult.camelot}` : ''}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons Area */}
            {isAnalyzing ? (
              <button
                onClick={toggleAnalysis}
                className="w-full py-2.5 rounded-xl font-semibold text-xs tracking-wide transition-all duration-200 shadow-lg flex items-center justify-center gap-2 bg-[#8c3232] text-[#f2f4cb] hover:brightness-110 shadow-[#8c3232]/30"
              >
                <span className="w-2 h-2 rounded-full bg-[#f2f4cb] animate-pulse" />
                ⏹ Stop Capture & Process
              </button>
            ) : dspResult ? (
              <div className="flex gap-2">
                <button
                  onClick={toggleAnalysis}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-xs tracking-wide transition-all duration-200 shadow-lg flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#b7990d] to-[#997e06] text-[#110b11] font-bold shadow-[#b7990d]/25 hover:brightness-110"
                >
                  <span>🔄</span>
                  Redo Analysis
                </button>
                <button
                  onClick={() => setDspResult(null)}
                  className="px-3.5 py-2.5 rounded-xl text-xs text-[#8cada7] hover:text-[#f2f4cb] bg-[#1a121a] border border-[#2e202e] transition-colors"
                  title="Clear results"
                >
                  Clear
                </button>
              </div>
            ) : (
              <button
                onClick={toggleAnalysis}
                disabled={!detection?.isSong}
                className={`w-full py-2.5 rounded-xl font-semibold text-xs tracking-wide transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                  !detection?.isSong
                    ? 'bg-[#1a121a] text-[#8cada7]/40 cursor-not-allowed border border-[#2e202e]'
                    : 'bg-gradient-to-r from-[#b7990d] to-[#997e06] text-[#110b11] font-bold shadow-[#b7990d]/25 hover:brightness-110'
                }`}
              >
                <span>▶</span>
                Start In-Browser DSP Capture
              </button>
            )}
          </div>
        )}

        {/* TAB 2: SONG INFO & AI LORE */}
        {activeTab === 'info' && (
          <div className="space-y-3 relative z-10 max-h-[380px] overflow-y-auto pr-1">
            {/* Public Metadata Card */}
            {publicMeta && (
              <div className="bg-[#1c141c]/90 border border-[#2e202e] rounded-xl p-3 flex gap-3 items-center backdrop-blur-md">
                {publicMeta.artworkUrl ? (
                  <img
                    src={publicMeta.artworkUrl}
                    alt="Album Artwork"
                    className="w-16 h-16 rounded-lg object-cover shadow-md border border-[#2e202e]"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-[#110b11] border border-[#2e202e] flex items-center justify-center text-xl">
                    💿
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#a5d0a8]/15 text-[#a5d0a8] border border-[#a5d0a8]/30">
                    {publicMeta.genre || 'Music'}
                  </span>
                  <h3 className="text-sm font-semibold text-[#f2f4cb] truncate mt-1">{publicMeta.title}</h3>
                  <p className="text-xs text-[#8cada7] truncate">{publicMeta.artist}</p>
                  {publicMeta.album && (
                    <p className="text-[10px] text-[#8cada7]/70 truncate mt-0.5">
                      Album: {publicMeta.album} {publicMeta.releaseYear && `(${publicMeta.releaseYear})`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* AI Lore Box */}
            <div className="bg-[#181118]/80 border border-[#2e202e] rounded-xl p-3 relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-[#b7990d] uppercase tracking-wider flex items-center gap-1">
                  <span>✨</span> AI Backstory & Lore
                </span>
                <button
                  onClick={handleGenerateLore}
                  disabled={loadingLore}
                  className="text-[10px] text-[#8cada7] hover:text-[#b7990d] underline"
                >
                  {loadingLore ? 'Generating...' : 'Refresh'}
                </button>
              </div>

              {loadingLore ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-[#b7990d] border-t-transparent rounded-full animate-spin" />
                  <p className="text-[11px] text-[#8cada7] font-mono">Analyzing track history & themes...</p>
                </div>
              ) : (
                <div className="text-xs text-[#f2f4cb]/90 leading-relaxed whitespace-pre-line space-y-2 font-sans">
                  {aiLore || 'Click Refresh to generate a musical breakdown.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-3 relative z-10 max-h-[380px] overflow-y-auto pr-1 text-xs">
            <div className="bg-[#1c141c]/90 border border-[#2e202e] rounded-xl p-3 space-y-3">
              <h3 className="text-xs font-bold text-[#f2f4cb] font-mono uppercase tracking-wider flex items-center gap-1.5">
                <span>🤖</span> AI API / Custom Proxy Setup
              </h3>

              {/* Mode Selection */}
              <div>
                <label className="text-[11px] text-[#8cada7] block mb-1">Select AI Backend</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => saveSettings({ ...aiSettings, provider: 'proxy' })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                      aiSettings.provider === 'proxy'
                        ? 'bg-[#b7990d]/20 text-[#f2f4cb] border-[#b7990d]/40'
                        : 'bg-[#110b11] text-[#8cada7] border-[#2e202e]'
                    }`}
                  >
                    API Key / Custom Proxy
                  </button>
                  <button
                    onClick={() => saveSettings({ ...aiSettings, provider: 'ollama' })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                      aiSettings.provider === 'ollama'
                        ? 'bg-[#a5d0a8]/20 text-[#f2f4cb] border-[#a5d0a8]/40'
                        : 'bg-[#110b11] text-[#8cada7] border-[#2e202e]'
                    }`}
                  >
                    Local Ollama
                  </button>
                </div>
              </div>

              {/* Proxy / API Key Inputs */}
              {aiSettings.provider === 'proxy' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-[#8cada7] block mb-0.5">Proxy / API Base URL</label>
                    <input
                      type="text"
                      placeholder="https://openrouter.ai/api/v1 (or custom proxy)"
                      value={aiSettings.proxyUrl || ''}
                      onChange={(e) => saveSettings({ ...aiSettings, proxyUrl: e.target.value })}
                      className="w-full bg-[#110b11] border border-[#2e202e] rounded-lg p-2 text-xs text-[#f2f4cb] focus:outline-none focus:border-[#b7990d] font-mono text-[11px]"
                    />
                    <p className="text-[9px] text-[#8cada7]/60 mt-0.5">Works with OpenRouter, OpenAI, LiteLLM, or custom proxies.</p>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#8cada7] block mb-0.5">API Key (Optional if proxy handles auth)</label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={aiSettings.apiKey || ''}
                      onChange={(e) => saveSettings({ ...aiSettings, apiKey: e.target.value })}
                      className="w-full bg-[#110b11] border border-[#2e202e] rounded-lg p-2 text-xs text-[#f2f4cb] focus:outline-none focus:border-[#b7990d]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#8cada7] block mb-0.5">Model Name</label>
                    <input
                      type="text"
                      placeholder="meta-llama/llama-3.3-70b-instruct:free or gpt-4o-mini"
                      value={aiSettings.model || ''}
                      onChange={(e) => saveSettings({ ...aiSettings, model: e.target.value })}
                      className="w-full bg-[#110b11] border border-[#2e202e] rounded-lg p-2 text-xs text-[#f2f4cb] focus:outline-none focus:border-[#b7990d] font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}

              {/* Ollama Inputs */}
              {aiSettings.provider === 'ollama' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-[#8cada7] block mb-0.5">Ollama Endpoint</label>
                    <input
                      type="text"
                      placeholder="http://localhost:11434"
                      value={aiSettings.ollamaEndpoint || ''}
                      onChange={(e) => saveSettings({ ...aiSettings, ollamaEndpoint: e.target.value })}
                      className="w-full bg-[#110b11] border border-[#2e202e] rounded-lg p-2 text-xs text-[#f2f4cb] focus:outline-none focus:border-[#a5d0a8] font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#8cada7] block mb-0.5">Ollama Model</label>
                    <input
                      type="text"
                      placeholder="llama3"
                      value={aiSettings.ollamaModel || ''}
                      onChange={(e) => saveSettings({ ...aiSettings, ollamaModel: e.target.value })}
                      className="w-full bg-[#110b11] border border-[#2e202e] rounded-lg p-2 text-xs text-[#f2f4cb] focus:outline-none focus:border-[#a5d0a8] font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}

              {/* Tavily Search Key */}
              <div className="pt-2 border-t border-[#2e202e]">
                <label className="text-[10px] text-[#8cada7] block mb-0.5">Tavily Web Search Key (Optional)</label>
                <input
                  type="password"
                  placeholder="tvly-..."
                  value={aiSettings.tavilyApiKey || ''}
                  onChange={(e) => saveSettings({ ...aiSettings, tavilyApiKey: e.target.value })}
                  className="w-full bg-[#110b11] border border-[#2e202e] rounded-lg p-2 text-xs text-[#f2f4cb] focus:outline-none focus:border-[#b7990d]"
                />
                <p className="text-[9px] text-[#8cada7]/60 mt-1">Enhances AI responses with live search facts and music news.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-[#2e202e] text-[10px] font-mono text-[#8cada7]/60 flex justify-between items-center relative z-10">
        <span>DSP Audio Engine v2.0</span>
        <span>Math: Krumhansl + Autocorr</span>
      </div>
    </div>
  )
}

export default App
