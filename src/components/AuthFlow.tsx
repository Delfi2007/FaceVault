import { useState, useRef, useCallback, useEffect } from 'react'
import CameraView from './CameraView'
import type { CameraViewHandle } from './CameraView'
import { detectFace, cosineSimilarity } from '../lib/faceEngine'
import { createLivenessState, updateLiveness, getChallengeText, getChallengeIcon } from '../lib/liveness'
import type { LivenessState } from '../lib/liveness'
import { decryptEmbedding, hashEmbedding } from '../lib/crypto'
import { getUsers, addAuditLog } from '../lib/db'
import type { EnrolledUser } from '../lib/db'
import { v4 as uuid } from '../lib/uuid'

interface Props { onBack: () => void }
type Stage = 'scanning' | 'liveness' | 'matching' | 'success' | 'fail'
const THRESHOLD = 0.45

export default function AuthFlow({ onBack }: Props) {
  const [stage, setStage] = useState<Stage>('scanning')
  const [face, setFace]   = useState(false)
  const [camOn, setCamOn] = useState(false)
  const [matched, setMatched] = useState<EnrolledUser|null>(null)
  const [sim, setSim]     = useState(0)
  const [fail, setFail]   = useState('')
  const [ear, setEar]     = useState({ l:0, r:0, base:0 })

  const livRef = useRef<LivenessState>(createLivenessState(true))
  const [livUI, setLivUI] = useState(livRef.current)
  const camRef = useRef<CameraViewHandle>(null)
  const raf    = useRef(0)
  const busy   = useRef(false)
  const stgRef = useRef<Stage>('scanning')
  const matchStarted = useRef(false)

  function go(s: Stage) { stgRef.current = s; setStage(s) }

  const loop = useCallback(async () => {
    if (busy.current) { raf.current = requestAnimationFrame(loop); return }
    const v = camRef.current?.getVideo()
    if (!v || v.readyState < 2) { raf.current = requestAnimationFrame(loop); return }
    busy.current = true
    try {
      const r = await detectFace(v)
      setFace(r.detected)
      if (r.detected && r.landmarks && r.descriptor) {
        setEar({ l: r.earLeft, r: r.earRight, base: livRef.current.earBaseline })
        const cur = stgRef.current
        if (cur === 'scanning') { go('liveness') }
        else if (cur === 'liveness') {
          const n = r.landmarks.positions
          const { state: ns, advancedChallenge } = updateLiveness(livRef.current, {
            earLeft: r.earLeft, earRight: r.earRight, earAvg: r.earAvg,
            noseTipX: n[30].x, leftEyeX: n[36].x, rightEyeX: n[45].x,
          })
          livRef.current = ns
          if (advancedChallenge) setLivUI({ ...ns })
          if (ns.passed && !matchStarted.current) {
            matchStarted.current = true; go('matching')
            await doMatch(Array.from(r.descriptor)); return
          }
        }
      }
    } finally { busy.current = false }
    raf.current = requestAnimationFrame(loop)
  }, [])

  useEffect(() => {
    if ((stgRef.current === 'scanning' || stgRef.current === 'liveness') && camOn)
      raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [stage, camOn, loop])

  async function doMatch(q: number[]) {
    try {
      const users = await getUsers()
      if (!users.length) { setFail('No enrolled users. Enroll first.'); go('fail'); return }
      let best: EnrolledUser|null = null; let bestS = -1
      for (const u of users) {
        const s = cosineSimilarity(q, await decryptEmbedding(u.encryptedEmbedding))
        if (s > bestS) { bestS = s; best = u }
      }
      const hash = await hashEmbedding(q); setSim(bestS)
      if (bestS >= THRESHOLD && best) {
        setMatched(best); go('success')
        await addAuditLog({ id:uuid(), userId:best.id, userName:best.name, action:'AUTH_SUCCESS', timestamp:Date.now(), embeddingHash:hash, similarity:bestS, synced:false })
      } else {
        setFail(`Best similarity ${(bestS*100).toFixed(1)}% — below threshold`); go('fail')
        await addAuditLog({ id:uuid(), userId:best?.id??'-', userName:best?.name??'Unknown', action:'AUTH_FAIL', timestamp:Date.now(), embeddingHash:hash, similarity:bestS, synced:false })
      }
    } catch { setFail('Match error — retry.'); go('fail') }
  }

  function retry() {
    livRef.current = createLivenessState(true); setLivUI(livRef.current)
    matchStarted.current = false
    setFace(false); setMatched(null); setSim(0); setFail(''); go('scanning')
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#f2f2f7]">

      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-[#e5e5ea]/60">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f2f2f7] transition-colors">
          <svg className="w-5 h-5 text-[#1c1c1e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <p className="flex-1 text-[15px] font-semibold text-[#1c1c1e]">Verify Identity</p>
        <span className={`w-2 h-2 rounded-full ${face ? 'bg-[#34c759]' : 'bg-[#e5e5ea]'} transition-colors`} />
      </div>

      {/* CAMERA */}
      {(stage === 'scanning' || stage === 'liveness') && (
        <div className="flex-1 flex flex-col">
          <div className="relative bg-black overflow-hidden" style={{ flex:'1 1 0', minHeight:'55vh' }}>
            <CameraView ref={camRef} onStream={setCamOn} className="absolute inset-0 w-full h-full object-cover" mirror />
            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />

            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`face-oval ${face ? 'liveness' : ''}`}
                style={{ width:'min(70vw,260px)', height:'min(88vw,330px)' }} />
            </div>
            <div className="cam-corner tl" /><div className="cam-corner tr" />
            <div className="cam-corner bl" /><div className="cam-corner br" />

            <div className="absolute top-4 inset-x-0 flex justify-center">
              {stage === 'scanning' ? (
                <div className="bg-black/70 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white blink-dot" />
                  <span className="text-white text-[13px] font-semibold">Position your face</span>
                </div>
              ) : (
                <div className="bg-black/70 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2">
                  <span className="text-white text-[14px]">{getChallengeIcon(livUI.currentChallenge)}</span>
                  <span className="text-white text-[13px] font-semibold">{getChallengeText(livUI.currentChallenge)}</span>
                </div>
              )}
            </div>

            {/* EAR diag */}
            {stage === 'liveness' && face && livUI.currentChallenge === 'BLINK' && livUI.baselineFrames >= 12 && (
              <div className="absolute top-[52px] inset-x-0 flex justify-center">
                <span className="text-[10px] text-white/40 font-mono bg-black/40 px-2 py-0.5 rounded">
                  EAR {ear.l.toFixed(2)} / {ear.r.toFixed(2)} — close below {Math.max(ear.base*0.78, ear.base-0.05).toFixed(2)}
                </span>
              </div>
            )}

            {stage === 'liveness' && face && livUI.baselineFrames < 20 && (
              <div className="absolute top-[52px] inset-x-0 flex justify-center">
                <span className="text-[11px] text-white/50 bg-black/40 px-2 py-0.5 rounded">
                  Calibrating ({livUI.baselineFrames}/20)
                </span>
              </div>
            )}

            {stage === 'liveness' && (
              <div className="absolute bottom-4 inset-x-3 flex justify-center gap-1.5 flex-wrap">
                {livUI.challenges.map((c, i) => (
                  <div key={c} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                    i < livUI.challengeIndex ? 'bg-white text-[#1c1c1e]'
                    : i === livUI.challengeIndex ? 'bg-white/20 text-white border border-white/30'
                    : 'bg-white/8 text-white/35'}`}>
                    {i < livUI.challengeIndex && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                    {getChallengeText(c)}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white px-5 py-3 border-t border-[#e5e5ea]/60">
            <p className="text-[12px] text-[#8e8e93] text-center">
              {!face ? 'Look straight at the camera' : `Step ${livUI.challengeIndex + 1}/${livUI.challenges.length}`}
            </p>
          </div>
        </div>
      )}

      {/* MATCHING */}
      {stage === 'matching' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 fade-up">
          <div className="w-14 h-14 rounded-2xl bg-[#f2f2f7] flex items-center justify-center">
            <svg className="w-6 h-6 text-[#8e8e93] spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[17px] font-semibold text-[#1c1c1e]">Matching</p>
            <p className="text-[13px] text-[#8e8e93] mt-1">Running cosine similarity on-device</p>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {stage === 'success' && matched && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 fade-up">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-[#1c1c1e] flex items-center justify-center">
              <span className="text-white text-2xl font-bold">{matched.avatarInitials}</span>
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#34c759] flex items-center justify-center border-2 border-white">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[22px] font-semibold text-[#1c1c1e]">{matched.name}</p>
            <p className="text-[14px] text-[#8e8e93] mt-0.5">{matched.role}</p>
          </div>
          <div className="card w-full max-w-xs overflow-hidden divide-y divide-[#f2f2f7]">
            {[
              ['Status', 'Verified'],
              ['Confidence', `${(sim * 100).toFixed(1)}%`],
              ['Method', 'Cosine similarity'],
              ['Time', new Date().toLocaleTimeString()],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-3">
                <span className="text-[12px] text-[#aeaeb2]">{k}</span>
                <span className="text-[12px] font-semibold text-[#1c1c1e]">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2.5 w-full max-w-xs">
            <button onClick={retry}
              className="flex-1 h-[50px] bg-[#f2f2f7] text-[#1c1c1e] text-[15px] font-semibold rounded-2xl active:opacity-80 transition-opacity">
              Again
            </button>
            <button onClick={onBack}
              className="flex-1 h-[50px] bg-[#1c1c1e] text-white text-[15px] font-semibold rounded-2xl active:opacity-80 transition-opacity">
              Done
            </button>
          </div>
        </div>
      )}

      {/* FAIL */}
      {stage === 'fail' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 fade-up">
          <div className="w-16 h-16 rounded-2xl bg-[#f2f2f7] flex items-center justify-center">
            <svg className="w-7 h-7 text-[#aeaeb2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[17px] font-semibold text-[#1c1c1e]">Not Verified</p>
            <p className="text-[13px] text-[#8e8e93] mt-2 max-w-[260px]">{fail}</p>
          </div>
          <div className="flex gap-2.5 w-full max-w-xs">
            <button onClick={onBack}
              className="flex-1 h-[50px] bg-[#f2f2f7] text-[#1c1c1e] text-[15px] font-semibold rounded-2xl active:opacity-80 transition-opacity">
              Cancel
            </button>
            <button onClick={retry}
              className="flex-1 h-[50px] bg-[#1c1c1e] text-white text-[15px] font-semibold rounded-2xl active:opacity-80 transition-opacity">
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
