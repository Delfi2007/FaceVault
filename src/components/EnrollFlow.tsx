import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowLeft, User, Briefcase, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import CameraView from './CameraView'
import type { CameraViewHandle } from './CameraView'
import { detectFace, averageEmbeddings } from '../lib/faceEngine'
import { createLivenessState, updateLiveness, getChallengeText, getChallengeIcon } from '../lib/liveness'
import type { LivenessState } from '../lib/liveness'
import { encryptEmbedding, hashEmbedding } from '../lib/crypto'
import { saveUser, addAuditLog } from '../lib/db'
import type { EnrolledUser } from '../lib/db'
import { v4 as uuid } from '../lib/uuid'

interface Props {
  onBack: () => void
  onSuccess: (user: EnrolledUser) => void
}

type Stage = 'form' | 'liveness' | 'capture' | 'processing' | 'done'

const NEEDED_CAPTURES = 5

export default function EnrollFlow({ onBack, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [stage, setStage] = useState<Stage>('form')

  // Liveness: keep real state in a ref so the rAF loop never captures a stale closure.
  // livenessUI is only for rendering — updated only when the challenge actually advances.
  const livenessRef = useRef<LivenessState>(createLivenessState(true))
  const [livenessUI, setLivenessUI] = useState<LivenessState>(livenessRef.current)

  const [cameraActive, setCameraActive] = useState(false)
  const [captureCount, setCaptureCount] = useState(0)
  const [faceDetected, setFaceDetected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enrolledUser, setEnrolledUser] = useState<EnrolledUser | null>(null)

  const cameraRef = useRef<CameraViewHandle>(null)
  const capturedEmbeddings = useRef<Float32Array[]>([])
  const animFrameRef = useRef<number>(0)
  const processingRef = useRef(false)
  // Track stage in a ref too so the rAF callback always reads the current value
  const stageRef = useRef<Stage>('form')

  function setStageSync(s: Stage) {
    stageRef.current = s
    setStage(s)
  }

  // Single continuous detection loop — reads from refs, never from closed-over state
  const runDetectionLoop = useCallback(async () => {
    if (processingRef.current) {
      animFrameRef.current = requestAnimationFrame(runDetectionLoop)
      return
    }

    const video = cameraRef.current?.getVideo()
    if (!video || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(runDetectionLoop)
      return
    }

    processingRef.current = true
    try {
      const result = await detectFace(video)
      setFaceDetected(result.detected)

      if (result.detected && result.landmarks && result.descriptor) {
        const currentStage = stageRef.current

        if (currentStage === 'liveness') {
          const noseTip  = result.landmarks.positions[30]
          const leftEye  = result.landmarks.positions[36]
          const rightEye = result.landmarks.positions[45]

          const { state: newState, advancedChallenge } = updateLiveness(livenessRef.current, {
            earLeft:   result.earLeft  ?? 0.3,
            earRight:  result.earRight ?? 0.3,
            earAvg:    result.earAvg   ?? 0.3,
            noseTipX:  noseTip.x,
            leftEyeX:  leftEye.x,
            rightEyeX: rightEye.x,
          })

          livenessRef.current = newState
          // Only re-render when something the user sees has changed
          if (advancedChallenge) setLivenessUI({ ...newState })

          if (newState.passed) {
            setStageSync('capture')
          }

        } else if (currentStage === 'capture') {
          capturedEmbeddings.current.push(result.descriptor)
          const count = capturedEmbeddings.current.length
          setCaptureCount(count)
          if (count >= NEEDED_CAPTURES) {
            setStageSync('processing')
            await finishEnrollment()
            return
          }
          await new Promise(r => setTimeout(r, 250))
        }
      }
    } finally {
      processingRef.current = false
    }

    animFrameRef.current = requestAnimationFrame(runDetectionLoop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — we read live values via refs

  // Start / stop the loop when stage or camera readiness changes
  useEffect(() => {
    if ((stageRef.current === 'liveness' || stageRef.current === 'capture') && cameraActive) {
      animFrameRef.current = requestAnimationFrame(runDetectionLoop)
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [stage, cameraActive, runDetectionLoop])

  async function finishEnrollment() {
    try {
      const avgEmbedding = averageEmbeddings(capturedEmbeddings.current)
      const encrypted = await encryptEmbedding(avgEmbedding)
      const hash = await hashEmbedding(avgEmbedding)
      const id = uuid()
      const user: EnrolledUser = {
        id,
        name,
        role,
        encryptedEmbedding: encrypted,
        deviceFingerprint: navigator.userAgent.substring(0, 64),
        enrolledAt: Date.now(),
        avatarInitials: name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase(),
      }
      await saveUser(user)
      await addAuditLog({
        id: uuid(),
        userId: id,
        userName: name,
        action: 'ENROLL',
        timestamp: Date.now(),
        embeddingHash: hash,
        synced: false,
      })
      setEnrolledUser(user)
      setStageSync('done')
    } catch {
      setError('Enrollment failed. Please try again.')
      const fresh = createLivenessState(true)
      livenessRef.current = fresh
      setLivenessUI(fresh)
      capturedEmbeddings.current = []
      setCaptureCount(0)
      setStageSync('liveness')
    }
  }

  function startLiveness() {
    if (!name.trim() || !role.trim()) {
      setError('Please enter your name and role.')
      return
    }
    setError(null)
    const fresh = createLivenessState(true)
    livenessRef.current = fresh
    setLivenessUI(fresh)
    setStageSync('liveness')
  }

  const stageSteps: Stage[] = ['form', 'liveness', 'capture', 'processing', 'done']

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-zinc-900">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-zinc-900 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h2 className="text-white font-semibold text-sm">Enroll Face</h2>
          <p className="text-zinc-600 text-xs">One-time biometric registration</p>
        </div>
        <div className="ml-auto flex gap-1">
          {stageSteps.map((s, i) => (
            <div
              key={s}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                stageSteps.indexOf(stage) >= i ? 'bg-white' : 'bg-zinc-800'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {/* STAGE: Form */}
        {stage === 'form' && (
          <div className="flex-1 flex flex-col justify-center p-6 max-w-sm mx-auto w-full space-y-6 slide-up">
            <div>
              <h3 className="text-xl font-bold text-white">Who are you?</h3>
              <p className="text-zinc-500 text-sm mt-1">Your identity, stored only on this device</p>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                  placeholder="Full name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                  placeholder="Role (e.g. Field Officer)"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && startLiveness()}
                />
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-zinc-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            <button
              onClick={startLiveness}
              disabled={!name.trim() || !role.trim()}
              className="w-full py-3 bg-white text-black font-semibold rounded-xl text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-100 transition-colors"
            >
              Begin Face Enrollment
            </button>
            <div className="border border-zinc-900 rounded-xl p-3 space-y-1.5">
              <p className="text-xs text-zinc-500 font-medium">Privacy guaranteed</p>
              <p className="text-xs text-zinc-700">Raw images are never stored. Only a 128-dimension encrypted math vector is saved locally using AES-256-GCM.</p>
            </div>
          </div>
        )}

        {/* STAGE: Liveness / Capture */}
        {(stage === 'liveness' || stage === 'capture') && (
          <div className="flex-1 flex flex-col">
            <div className="relative flex-1 bg-zinc-950 overflow-hidden" style={{ minHeight: '400px' }}>
              <CameraView
                ref={cameraRef}
                onStream={setCameraActive}
                className="w-full h-full object-cover absolute inset-0"
                mirror={true}
              />
              <div className="scanline absolute inset-0" />

              {/* Face oval guide */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`face-oval w-44 h-56 sm:w-52 sm:h-64 ${
                    faceDetected
                      ? stage === 'capture' ? 'success' : 'detected'
                      : ''
                  }`}
                />
              </div>

              {/* Corner brackets */}
              <div className="camera-corner tl" />
              <div className="camera-corner tr" />
              <div className="camera-corner bl" />
              <div className="camera-corner br" />

              {/* Challenge pill */}
              {stage === 'liveness' && (
                <div className="absolute top-4 inset-x-4 flex justify-center">
                  <div className="bg-black/80 backdrop-blur-sm border border-zinc-800 rounded-full px-4 py-2 flex items-center gap-2">
                    <span className="text-lg">{getChallengeIcon(livenessUI.currentChallenge)}</span>
                    <span className="text-white text-sm font-medium">{getChallengeText(livenessUI.currentChallenge)}</span>
                  </div>
                </div>
              )}

              {/* EAR debug (dev only) */}
              {stage === 'liveness' && (
                <div className="absolute bottom-20 inset-x-4 flex justify-center">
                  <div className="bg-black/60 px-3 py-1 rounded text-xs text-zinc-400 font-mono">
                    {faceDetected ? `EAR L:${(livenessRef.current as any)._dbgEarL?.toFixed(2) ?? '–'}  R:${(livenessRef.current as any)._dbgEarR?.toFixed(2) ?? '–'}` : 'No face'}
                  </div>
                </div>
              )}

              {/* Capture progress */}
              {stage === 'capture' && (
                <div className="absolute top-4 inset-x-4 flex justify-center">
                  <div className="bg-black/80 backdrop-blur-sm border border-zinc-800 rounded-full px-4 py-2 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-white blink" />
                    <span className="text-white text-sm font-medium">Capturing {captureCount}/{NEEDED_CAPTURES}</span>
                  </div>
                </div>
              )}

              {/* Liveness step chips */}
              {stage === 'liveness' && (
                <div className="absolute bottom-4 inset-x-4">
                  <div className="flex justify-center gap-2 flex-wrap">
                    {livenessUI.challenges.map((c, i) => (
                      <div
                        key={c}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
                          i < livenessUI.challengeIndex
                            ? 'bg-white text-black'
                            : i === livenessUI.challengeIndex
                            ? 'bg-zinc-800 text-white border border-zinc-600'
                            : 'bg-zinc-900 text-zinc-600'
                        }`}
                      >
                        {i < livenessUI.challengeIndex && <CheckCircle className="w-3 h-3" />}
                        {getChallengeText(c)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STAGE: Processing */}
        {stage === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 slide-up">
            <div className="w-16 h-16 rounded-full border border-zinc-800 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
            <div className="text-center">
              <h3 className="text-white font-semibold">Processing biometrics</h3>
              <p className="text-zinc-500 text-sm mt-1">Encrypting and storing your template</p>
            </div>
            <div className="w-full max-w-xs space-y-2">
              {['Averaging 5 embeddings', 'AES-256-GCM encrypt', 'Writing to local store'].map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-white shimmer" style={{ animationDelay: `${i * 0.3}s` }} />
                  <span className="text-zinc-500 text-xs">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STAGE: Done */}
        {stage === 'done' && enrolledUser && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 slide-up">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-black" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-white">Enrolled!</h3>
              <p className="text-zinc-500 text-sm mt-1">{enrolledUser.name} — {enrolledUser.role}</p>
            </div>
            <div className="w-full max-w-xs border border-zinc-800 rounded-xl divide-y divide-zinc-900">
              {[
                ['Status', 'Active'],
                ['Template', '128-dim AES encrypted'],
                ['Storage', 'Local device only'],
                ['Enrolled', new Date(enrolledUser.enrolledAt).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-4 py-2.5">
                  <span className="text-zinc-600 text-xs">{k}</span>
                  <span className="text-white text-xs font-mono">{v}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => onSuccess(enrolledUser)}
              className="w-full max-w-xs py-3 bg-white text-black font-semibold rounded-xl text-sm hover:bg-zinc-100 transition-colors"
            >
              Continue to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
