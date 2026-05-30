import { useEffect, useState } from 'react'
import { loadModels } from '../lib/faceEngine'
import { Shield } from 'lucide-react'

interface Props {
  onLoaded: () => void
}

export default function ModelLoader({ onLoaded }: Props) {
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Initializing secure enclave...')

  useEffect(() => {
    const stages = [
      { at: 10, msg: 'Loading face detector...' },
      { at: 40, msg: 'Loading landmark model...' },
      { at: 70, msg: 'Loading recognition network...' },
      { at: 100, msg: 'Encryption layer ready' },
    ]

    loadModels(pct => {
      setProgress(pct)
      const stage = stages.find(s => s.at === pct)
      if (stage) setStatus(stage.msg)
      if (pct === 100) {
        setTimeout(() => onLoaded(), 600)
      }
    }).catch(err => {
      setError(err?.message ?? 'Failed to load models. Check your connection.')
    })
  }, [onLoaded])

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center">
            <Shield className="w-10 h-10 text-black" strokeWidth={2} />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white">FaceVault</h1>
            <p className="text-sm text-zinc-500 mt-1">Zero-Trust Offline Biometrics</p>
          </div>
        </div>

        {/* Progress */}
        {!error ? (
          <div className="space-y-3">
            <div className="h-px bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">{status}</span>
              <span className="text-zinc-600 font-mono">{progress}%</span>
            </div>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-sm text-zinc-400">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 text-sm border border-zinc-700 rounded-lg text-white hover:bg-zinc-900 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Trust indicators */}
        <div className="grid grid-cols-3 gap-2">
          {['On-Device AI', 'AES-256', 'No Cloud'].map(label => (
            <div key={label} className="border border-zinc-800 rounded-lg py-2 px-1 text-center">
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
