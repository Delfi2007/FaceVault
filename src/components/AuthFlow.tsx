import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowLeft, CheckCircle, Loader2, ShieldAlert } from 'lucide-react'
import CameraView from './CameraView'
import type { CameraViewHandle } from './CameraView'
import { detectFace, cosineSimilarity } from '../lib/faceEngine'
import { createLivenessState, updateLiveness, getChallengeText, getChallengeIcon } from '../lib/liveness'
import type { LivenessState } from '../lib/liveness'
import { decryptEmbedding, hashEmbedding } from '../lib/crypto'
import { getUsers, addAuditLog } from '../lib/db'
import type { EnrolledUser } from '../lib/db'
import { v4 as uuid } from '../lib/uuid'

interface Props {
  onBack: () => void
}

type Stage = 'scanning' | 'liveness' | 'matching' | 'success' | 'fail'

const AUTH_THRESHOLD = 0.45

export default function AuthFlow({ onBack }: Props) {
  const [stage, setStage] = useState<Stage>('scanning')
  const [faceDetected, setFaceDetected] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [matchedUser, setMatchedUser] = useState<EnrolledUser | null>(null)
  const [similarity, setSimilarity] = useState(0)
  const [failReason, setFailReason] = useState('')

  // Liveness state lives in a ref so the rAF loop is never stale
  const livenessRef = useRef<LivenessState>(createLivenessState(true))
  const [livenessUI, setLivenessUI] = useState<LivenessState>(livenessRef.current)

  const cameraRef = useRef<CameraViewHandle>(null)
  const animFrameRef = useRef<number>(0)
  const processingRef = useRef(false)
  const stageRef = useRef<Stage>('scanning')
  // Capture one descriptor once liveness passes; avoid running matching twice
  const matchingStarted = useRef(false)

  function setStageSync(s: Stage) {
    stageRef.current = s
    setStage(s)
  }

  const runLoop = useCallback(async () => {
    if (processingRef.current) {
      animFrameRef.current = requestAnimationFrame(runLoop)
      return
    }

    const video = cameraRef.current?.getVideo()
    if (!video || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(runLoop)
      return
    }

    processingRef.current = true
    try {
      const result = await detectFace(video)
      setFaceDetected(result.detected)

      if (result.detected && result.landmarks && result.descriptor) {
        const currentStage = stageRef.current

        if (currentStage === 'scanning') {
          setStageSync('liveness')

        } else if (currentStage === 'liveness') {
          const noseTip  = result.landmarks.positions[30]
          const leftEye  = result.landmarks.positions[36]
          const rightEye = result.landmarks.positions[45]

          const { state: newState, advancedChallenge } = updateLiveness(livenessRef.current, {
            earLeft:   result.earLeft,
            earRight:  result.earRight,
            earAvg:    result.earAvg,
            noseTipX:  noseTip.x,
            leftEyeX:  leftEye.x,
            rightEyeX: rightEye.x,
          })

          livenessRef.current = newState
          if (advancedChallenge) setLivenessUI({ ...newState })

          if (newState.passed && !matchingStarted.current) {
            matchingStarted.current = true
            setStageSync('matching')
            await runMatching(Array.from(result.descriptor))
            return
          }
        }
      }
    } finally {
      processingRef.current = false
    }

    animFrameRef.current = requestAnimationFrame(runLoop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — live values via refs

  useEffect(() => {
    if ((stageRef.current === 'scanning' || stageRef.current === 'liveness') && cameraActive) {
      animFrameRef.current = requestAnimationFrame(runLoop)
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [stage, cameraActive, runLoop])

  async function runMatching(queryEmbedding: number[]) {
    try {
      const users = await getUsers()
      if (users.length === 0) {
        setFailReason('No enrolled users found. Please enroll first.')
        setStageSync('fail')
        return
      }

      let bestMatch: EnrolledUser | null = null
      let bestSim = -1

      for (const user of users) {
        const stored = await decryptEmbedding(user.encryptedEmbedding)
        const sim = cosineSimilarity(queryEmbedding, stored)
        if (sim > bestSim) { bestSim = sim; bestMatch = user }
      }

      const hash = await hashEmbedding(queryEmbedding)
      setSimilarity(bestSim)

      if (bestSim >= AUTH_THRESHOLD && bestMatch) {
        setMatchedUser(bestMatch)
        setStageSync('success')
        await addAuditLog({
          id: uuid(), userId: bestMatch.id, userName: bestMatch.name,
          action: 'AUTH_SUCCESS', timestamp: Date.now(),
          embeddingHash: hash, similarity: bestSim, synced: false,
        })
      } else {
        setFailReason(`Identity could not be verified. Similarity: ${(bestSim * 100).toFixed(1)}%`)
        setStageSync('fail')
        await addAuditLog({
          id: uuid(), userId: bestMatch?.id ?? 'unknown', userName: bestMatch?.name ?? 'Unknown',
          action: 'AUTH_FAIL', timestamp: Date.now(),
          embeddingHash: hash, similarity: bestSim, synced: false,
        })
      }
    } catch {
      setFailReason('Matching error. Please try again.')
      setStageSync('fail')
    }
  }

  function retry() {
    const fresh = createLivenessState(true)
    livenessRef.current = fresh
    setLivenessUI(fresh)
    matchingStarted.current = false
    setFaceDetected(false)
    setMatchedUser(null)
    setSimilarity(0)
    setFailReason('')
    setStageSync('scanning')
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-zinc-900">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-zinc-900 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h2 className="text-white font-semibold text-sm">Verify Identity</h2>
          <p className="text-zinc-600 text-xs">Offline biometric authentication</p>
        </div>
        <div className="ml-auto">
          <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-white' : 'bg-zinc-800'} transition-colors`} />
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {(stage === 'scanning' || stage === 'liveness') && (
          <div className="flex-1 flex flex-col">
            <div className="relative flex-1 bg-zinc-950 overflow-hidden" style={{ minHeight: '400px' }}>
              <CameraView
                ref={cameraRef}
                onStream={setCameraActive}
                className="w-full h-full object-cover absolute inset-0"
                mirror={true}
              />
              <div className="scanline absolute inset-0" />

              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`face-oval w-44 h-56 sm:w-52 sm:h-64 ${faceDetected ? 'detected' : ''}`} />
              </div>

              <div className="camera-corner tl" />
              <div className="camera-corner tr" />
              <div className="camera-corner bl" />
              <div className="camera-corner br" />

              {stage === 'scanning' && (
                <div className="absolute top-4 inset-x-4 flex justify-center">
                  <div className="bg-black/80 backdrop-blur-sm border border-zinc-800 rounded-full px-4 py-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-white blink" />
                    <span className="text-white text-sm">Position your face</span>
                  </div>
                </div>
              )}

              {stage === 'liveness' && (
                <div className="absolute top-4 inset-x-4 flex justify-center">
                  <div className="bg-black/80 backdrop-blur-sm border border-zinc-800 rounded-full px-4 py-2 flex items-center gap-2">
                    <span className="text-lg">{getChallengeIcon(livenessUI.currentChallenge)}</span>
                    <span className="text-white text-sm font-medium">{getChallengeText(livenessUI.currentChallenge)}</span>
                  </div>
                </div>
              )}

              {/* EAR live readout — helps confirm detection is working */}
              {stage === 'liveness' && faceDetected && (
                <div className="absolute bottom-20 inset-x-4 flex justify-center">
                  <div className="bg-black/60 px-3 py-1 rounded text-xs text-zinc-500 font-mono">
                    blink challenge active — close both eyes fully
                  </div>
                </div>
              )}

              {stage === 'liveness' && (
                <div className="absolute bottom-4 inset-x-4">
                  <div className="flex justify-center gap-2 flex-wrap">
                    {livenessUI.challenges.map((c, i) => (
                      <div
                        key={c}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
                          i < livenessUI.challengeIndex ? 'bg-white text-black'
                          : i === livenessUI.challengeIndex ? 'bg-zinc-800 text-white border border-zinc-600'
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

        {stage === 'matching' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 slide-up">
            <div className="w-16 h-16 rounded-full border border-zinc-800 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
            <div className="text-center">
              <h3 className="text-white font-semibold">Matching identity</h3>
              <p className="text-zinc-500 text-sm mt-1">Running cosine similarity on-device</p>
            </div>
          </div>
        )}

        {stage === 'success' && matchedUser && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 slide-up">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center">
                <span className="text-3xl font-bold text-black">{matchedUser.avatarInitials}</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-black border-2 border-black flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-white">{matchedUser.name}</h3>
              <p className="text-zinc-500 text-sm">{matchedUser.role}</p>
            </div>
            <div className="w-full max-w-xs border border-zinc-800 rounded-xl divide-y divide-zinc-900">
              {[
                ['Status', 'Verified'],
                ['Match confidence', `${(similarity * 100).toFixed(1)}%`],
                ['Method', 'Cosine similarity'],
                ['Timestamp', new Date().toLocaleTimeString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-4 py-2.5">
                  <span className="text-zinc-600 text-xs">{k}</span>
                  <span className="text-white text-xs font-mono">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 w-full max-w-xs">
              <button onClick={retry} className="flex-1 py-3 border border-zinc-800 text-white font-medium rounded-xl text-sm hover:bg-zinc-900 transition-colors">Verify Again</button>
              <button onClick={onBack} className="flex-1 py-3 bg-white text-black font-semibold rounded-xl text-sm hover:bg-zinc-100 transition-colors">Done</button>
            </div>
          </div>
        )}

        {stage === 'fail' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 slide-up">
            <div className="w-20 h-20 rounded-full border border-zinc-800 flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-zinc-400" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white">Verification Failed</h3>
              <p className="text-zinc-500 text-sm mt-2 max-w-xs">{failReason}</p>
            </div>
            <div className="flex gap-3 w-full max-w-xs">
              <button onClick={onBack} className="flex-1 py-3 border border-zinc-800 text-white font-medium rounded-xl text-sm hover:bg-zinc-900 transition-colors">Cancel</button>
              <button onClick={retry} className="flex-1 py-3 bg-white text-black font-semibold rounded-xl text-sm hover:bg-zinc-100 transition-colors">Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
