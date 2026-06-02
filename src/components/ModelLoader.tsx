import { useEffect, useState } from 'react'
import { loadModels } from '../lib/faceEngine'

interface Props { onLoaded: () => void }

export default function ModelLoader({ onLoaded }: Props) {
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('Initialising')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stages: Record<number, string> = {
      10: 'Loading face detector',
      40: 'Loading landmarks',
      70: 'Loading recognition net',
      100: 'Ready',
    }
    loadModels(pct => {
      setProgress(pct)
      if (stages[pct]) setLabel(stages[pct])
      if (pct === 100) setTimeout(onLoaded, 600)
    }).catch(e => setError(e?.message ?? 'Failed to load AI models'))
  }, [onLoaded])

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-[280px] space-y-8 fade-up">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-[18px] bg-[#1c1c1e] flex items-center justify-center">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-semibold text-[#1c1c1e] tracking-tight">FaceVault</h1>
            <p className="text-[13px] text-[#8e8e93] mt-0.5">Zero-Trust Offline Biometrics</p>
          </div>
        </div>

        {error ? (
          <div className="space-y-3">
            <div className="card p-4 text-[13px] text-[#ff3b30]">{error}</div>
            <button onClick={() => window.location.reload()}
              className="w-full h-[50px] bg-[#1c1c1e] text-white text-[15px] font-semibold rounded-[14px] active:opacity-80 transition-opacity">
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-1 bg-[#e5e5ea] rounded-full overflow-hidden">
              <div className="h-full bg-[#1c1c1e] rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-[#8e8e93]">{label}</span>
              <span className="text-[12px] text-[#c7c7cc] font-mono tabular-nums">{progress}%</span>
            </div>
          </div>
        )}

        {/* Badges */}
        <div className="card overflow-hidden divide-y divide-[#f2f2f7]">
          {[
            { icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z', label: 'AES-256 Encryption', desc: 'Military-grade on-device' },
            { icon: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418', label: 'No Cloud Required', desc: 'Works fully offline' },
            { icon: 'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z', label: 'On-Device AI', desc: '<100ms inference' },
          ].map(b => (
            <div key={b.label} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-xl bg-[#f2f2f7] flex items-center justify-center shrink-0">
                <svg className="w-[18px] h-[18px] text-[#8e8e93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={b.icon} />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-medium text-[#1c1c1e]">{b.label}</p>
                <p className="text-[11px] text-[#aeaeb2]">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
