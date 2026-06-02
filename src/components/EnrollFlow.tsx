import { useState, useRef, useCallback, useEffect } from 'react'
import CameraView from './CameraView'
import type { CameraViewHandle } from './CameraView'
import { detectFace, averageEmbeddings } from '../lib/faceEngine'
import { createLivenessState, updateLiveness, getChallengeText, getChallengeIcon } from '../lib/liveness'
import type { LivenessState } from '../lib/liveness'
import { encryptEmbedding, hashEmbedding } from '../lib/crypto'
import { saveUser, addAuditLog } from '../lib/db'
import type { EnrolledUser } from '../lib/db'
import { v4 as uuid } from '../lib/uuid'

interface Props { onBack: () => void; onSuccess: (u: EnrolledUser) => void }
type Stage = 'form' | 'camera' | 'processing' | 'done'
const CAPTURES = 5

export default function EnrollFlow({ onBack, onSuccess }: Props) {
  const [name, setName]   = useState('')
  const [role, setRole]   = useState('')
  const [stage, setStage] = useState<Stage>('form')
  const [camOn, setCamOn] = useState(false)
  const [face, setFace]   = useState(false)
  const [caps, setCaps]   = useState(0)
  const [err, setErr]     = useState<string|null>(null)
  const [done, setDone]   = useState<EnrolledUser|null>(null)
  const [ear, setEar]     = useState({ l:0, r:0, base:0 })

  const livRef    = useRef<LivenessState>(createLivenessState(true))
  const [livUI, setLivUI] = useState(livRef.current)
  const camRef    = useRef<CameraViewHandle>(null)
  const embs      = useRef<Float32Array[]>([])
  const raf       = useRef(0)
  const busy      = useRef(false)
  const stgRef    = useRef<Stage>('form')
  const phase     = useRef<'liveness'|'capture'>('liveness')

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
        if (phase.current === 'liveness') {
          const n = r.landmarks.positions
          const { state: ns, advancedChallenge } = updateLiveness(livRef.current, {
            earLeft: r.earLeft, earRight: r.earRight, earAvg: r.earAvg,
            noseTipX: n[30].x, leftEyeX: n[36].x, rightEyeX: n[45].x,
          })
          livRef.current = ns
          if (advancedChallenge) setLivUI({ ...ns })
          if (ns.passed) phase.current = 'capture'
        } else {
          embs.current.push(r.descriptor)
          const c = embs.current.length; setCaps(c)
          if (c >= CAPTURES) { go('processing'); await finish(); return }
          await new Promise(r => setTimeout(r, 200))
        }
      }
    } finally { busy.current = false }
    raf.current = requestAnimationFrame(loop)
  }, [])

  useEffect(() => {
    if (stage === 'camera' && camOn) raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [stage, camOn, loop])

  async function finish() {
    try {
      const avg = averageEmbeddings(embs.current)
      const enc = await encryptEmbedding(avg)
      const hash = await hashEmbedding(avg)
      const id = uuid()
      const user: EnrolledUser = {
        id, name, role, encryptedEmbedding: enc,
        deviceFingerprint: navigator.userAgent.slice(0, 64),
        enrolledAt: Date.now(),
        avatarInitials: name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
      }
      await saveUser(user)
      await addAuditLog({ id: uuid(), userId: id, userName: name, action: 'ENROLL', timestamp: Date.now(), embeddingHash: hash, synced: false })
      setDone(user); go('done')
    } catch {
      setErr('Enrollment failed. Please try again.')
      livRef.current = createLivenessState(true); setLivUI(livRef.current)
      phase.current = 'liveness'; embs.current = []; setCaps(0); go('camera')
    }
  }

  function begin() {
    if (!name.trim() || !role.trim()) { setErr('Enter name and role.'); return }
    setErr(null)
    livRef.current = createLivenessState(true); setLivUI(livRef.current)
    phase.current = 'liveness'; go('camera')
  }

  const isCapture = livUI.passed

  return (
    <div className="flex flex-col min-h-screen bg-[#f2f2f7]">

      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-[#e5e5ea]/60">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f2f2f7] transition-colors">
          <svg className="w-5 h-5 text-[#1c1c1e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-[#1c1c1e]">Enroll Face</p>
        </div>
        <div className="flex gap-1">
          {(['form','camera','processing','done'] as Stage[]).map((s, i) => (
            <div key={s} className={`h-1 rounded-full transition-all duration-300 ${
              (['form','camera','processing','done'] as Stage[]).indexOf(stage) >= i
                ? 'w-4 bg-[#1c1c1e]' : 'w-1.5 bg-[#e5e5ea]'}`} />
          ))}
        </div>
      </div>

      {/* FORM */}
      {stage === 'form' && (
        <div className="flex-1 flex flex-col justify-center p-5 fade-up">
          <div className="space-y-6 max-w-sm mx-auto w-full">
            <div>
              <h2 className="text-[22px] font-semibold text-[#1c1c1e] tracking-tight">Who are you?</h2>
              <p className="text-[13px] text-[#8e8e93] mt-1">Identity stored only on this device</p>
            </div>
            <div className="space-y-3">
              <input className="w-full card px-4 h-[50px] text-[15px] text-[#1c1c1e] placeholder-[#c7c7cc] focus:outline-none focus:ring-2 focus:ring-[#1c1c1e]/10"
                placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
              <input className="w-full card px-4 h-[50px] text-[15px] text-[#1c1c1e] placeholder-[#c7c7cc] focus:outline-none focus:ring-2 focus:ring-[#1c1c1e]/10"
                placeholder="Role (e.g. Field Officer)" value={role} onChange={e => setRole(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && begin()} />
            </div>
            {err && <p className="text-[13px] text-[#ff3b30]">{err}</p>}
            <button onClick={begin} disabled={!name.trim()||!role.trim()}
              className="w-full h-[50px] bg-[#1c1c1e] text-white text-[15px] font-semibold rounded-2xl disabled:opacity-30 active:opacity-80 transition-opacity">
              Begin Enrollment
            </button>
            <div className="card p-4">
              <p className="text-[12px] text-[#8e8e93] leading-relaxed">
                <span className="font-semibold text-[#636366]">Privacy first.</span> Raw images are never saved.
                Only a 128-dim encrypted embedding is stored locally via AES-256-GCM.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA */}
      {stage === 'camera' && (
        <div className="flex-1 flex flex-col">
          <div className="relative bg-black overflow-hidden" style={{ flex: '1 1 0', minHeight: '55vh' }}>
            <CameraView ref={camRef} onStream={setCamOn} className="absolute inset-0 w-full h-full object-cover" mirror />
            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />

            {/* Large oval */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`face-oval ${face ? (isCapture ? 'success' : 'liveness') : ''}`}
                style={{ width: 'min(70vw, 260px)', height: 'min(88vw, 330px)' }} />
            </div>

            <div className="cam-corner tl" /><div className="cam-corner tr" />
            <div className="cam-corner bl" /><div className="cam-corner br" />

            {/* Top pill */}
            <div className="absolute top-4 inset-x-0 flex justify-center">
              {!isCapture ? (
                <div className="bg-black/70 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2">
                  <span className="text-white text-[14px]">{getChallengeIcon(livUI.currentChallenge)}</span>
                  <span className="text-white text-[13px] font-semibold">{getChallengeText(livUI.currentChallenge)}</span>
                </div>
              ) : (
                <div className="bg-black/70 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white blink-dot" />
                  <span className="text-white text-[13px] font-semibold">Capturing {caps}/{CAPTURES}</span>
                </div>
              )}
            </div>

            {/* EAR diag during blink */}
            {!isCapture && face && livUI.currentChallenge === 'BLINK' && livUI.baselineFrames >= 12 && (
              <div className="absolute top-[52px] inset-x-0 flex justify-center">
                <span className="text-[10px] text-white/40 font-mono bg-black/40 px-2 py-0.5 rounded">
                  EAR {ear.l.toFixed(2)} / {ear.r.toFixed(2)} — close below {Math.max(ear.base * 0.78, ear.base - 0.05).toFixed(2)}
                </span>
              </div>
            )}

            {/* Calibrating */}
            {!isCapture && face && livUI.baselineFrames < 20 && (
              <div className="absolute top-[52px] inset-x-0 flex justify-center">
                <span className="text-[11px] text-white/50 bg-black/40 px-2 py-0.5 rounded">
                  Calibrating… keep eyes open ({livUI.baselineFrames}/20)
                </span>
              </div>
            )}

            {/* Step chips */}
            {!isCapture && (
              <div className="absolute bottom-4 inset-x-3 flex justify-center gap-1.5 flex-wrap">
                {livUI.challenges.map((c, i) => (
                  <div key={c} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                    i < livUI.challengeIndex ? 'bg-white text-[#1c1c1e]'
                    : i === livUI.challengeIndex ? 'bg-white/20 text-white border border-white/30'
                    : 'bg-white/8 text-white/35'}`}>
                    {i < livUI.challengeIndex ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : null}
                    {getChallengeText(c)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="bg-white px-5 py-3 border-t border-[#e5e5ea]/60">
            <p className="text-[12px] text-[#8e8e93] text-center">
              {!face ? 'Position your face in the oval'
                : !isCapture ? `Step ${livUI.challengeIndex + 1}/${livUI.challenges.length}`
                : 'Hold still — capturing embeddings'}
            </p>
          </div>
        </div>
      )}

      {/* PROCESSING */}
      {stage === 'processing' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 fade-up">
          <div className="w-14 h-14 rounded-2xl bg-[#f2f2f7] flex items-center justify-center">
            <svg className="w-6 h-6 text-[#8e8e93] spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[17px] font-semibold text-[#1c1c1e]">Processing</p>
            <p className="text-[13px] text-[#8e8e93] mt-1">Encrypting biometric template</p>
          </div>
        </div>
      )}

      {/* DONE */}
      {stage === 'done' && done && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 fade-up">
          <div className="w-16 h-16 rounded-full bg-[#1c1c1e] flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[22px] font-semibold text-[#1c1c1e]">Enrolled</p>
            <p className="text-[14px] text-[#8e8e93] mt-1">{done.name} · {done.role}</p>
          </div>
          <div className="card w-full max-w-xs overflow-hidden divide-y divide-[#f2f2f7]">
            {[
              ['Status', 'Active'],
              ['Template', '128-dim · AES-256'],
              ['Storage', 'Device only'],
              ['Date', new Date(done.enrolledAt).toLocaleString()],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-3">
                <span className="text-[12px] text-[#aeaeb2]">{k}</span>
                <span className="text-[12px] font-medium text-[#1c1c1e]">{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => onSuccess(done)}
            className="w-full max-w-xs h-[50px] bg-[#1c1c1e] text-white text-[15px] font-semibold rounded-2xl active:opacity-80 transition-opacity">
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  )
}
