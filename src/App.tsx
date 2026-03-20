import { useState } from 'react'

function App() {
  const [analyzing, setAnalyzing] = useState(false)

  return (
    <div className="w-80 p-4 bg-gray-900 text-white font-sans">
      <h1 className="text-xl font-bold mb-4">Musical Extension</h1>
      
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <p className="text-sm text-gray-400 mb-2">Current Song Analysis</p>
        {analyzing ? (
          <div className="animate-pulse flex flex-col gap-2">
            <div className="h-4 bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
          </div>
        ) : (
          <div>
            <p className="text-lg font-semibold text-blue-400">Not Analyzing</p>
            <p className="text-xs text-gray-500">Go to a YouTube video to start</p>
          </div>
        )}
      </div>

      <button 
        onClick={() => setAnalyzing(!analyzing)}
        className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-medium transition-colors"
      >
        {analyzing ? 'Stop Analysis' : 'Start Analysis'}
      </button>

      <div className="mt-4 flex justify-between text-xs text-gray-500">
        <span>BPM: --</span>
        <span>Key: --</span>
      </div>
    </div>
  )
}

export default App
