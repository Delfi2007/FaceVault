// Passive liveness detection via EAR blink detection

export type LivenessChallenge = 'BLINK' | 'TURN_LEFT' | 'TURN_RIGHT'

export interface LivenessState {
  currentChallenge: LivenessChallenge
  challengeIndex: number
  challenges: LivenessChallenge[]
  passed: boolean
  blinkCount: number
  // How many consecutive frames the eye has been detected as closed
  closedFrames: number
  // Eye was closed at least MIN_CLOSED_FRAMES, waiting for open to complete the blink
  blinkActive: boolean
  framesSinceChallenge: number
}

// Open eyes are ~0.25–0.35. Closed eyes are ~0.05–0.18.
// 0.21 gives comfortable margin from normal open-eye variance.
const BLINK_CLOSE_THRESHOLD = 0.21
// Must be open above this to complete the blink (hysteresis prevents noise triggers)
const BLINK_OPEN_THRESHOLD = 0.25
// Eye must be detectably closed for at least this many frames to count (filters noise)
const MIN_CLOSED_FRAMES = 1
// Head turn: nose x-coord should be significantly closer to one eye corner
// expressed as a fraction of inter-eye distance so it scales with face size
const HEAD_TURN_FRACTION = 0.30

export function createLivenessState(randomize = true): LivenessState {
  const base: LivenessChallenge[] = ['BLINK', 'TURN_LEFT', 'TURN_RIGHT']
  const challenges = randomize ? shuffleArray([...base]) : base
  return {
    currentChallenge: challenges[0],
    challengeIndex: 0,
    challenges,
    passed: false,
    blinkCount: 0,
    closedFrames: 0,
    blinkActive: false,
    framesSinceChallenge: 0,
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export interface LandmarkPoints {
  earLeft: number
  earRight: number
  earAvg: number
  leftEyeX?: number   // left-corner landmark x of left eye  (landmark 36)
  rightEyeX?: number  // right-corner landmark x of right eye (landmark 45)
  noseTipX?: number   // nose tip x (landmark 30)
}

export function updateLiveness(
  state: LivenessState,
  pts: LandmarkPoints
): { state: LivenessState; advancedChallenge: boolean } {
  if (state.passed) return { state, advancedChallenge: false }

  let s = { ...state }
  s.framesSinceChallenge++
  let advancedChallenge = false

  const challenge = s.currentChallenge

  if (challenge === 'BLINK') {
    // Use the average of both eyes, but also require both eyes individually show change
    // to avoid a wink being accepted
    const bothClosed = pts.earLeft < BLINK_CLOSE_THRESHOLD && pts.earRight < BLINK_CLOSE_THRESHOLD
    const bothOpen = pts.earLeft > BLINK_OPEN_THRESHOLD && pts.earRight > BLINK_OPEN_THRESHOLD

    if (bothClosed) {
      s.closedFrames++
      if (s.closedFrames >= MIN_CLOSED_FRAMES) {
        s.blinkActive = true
      }
    } else if (bothOpen && s.blinkActive) {
      // Eye re-opened after a confirmed closed phase → blink complete
      s.blinkActive = false
      s.closedFrames = 0
      s.blinkCount++
      if (s.blinkCount >= 1) {
        advancedChallenge = true
        s = advanceChallenge(s)
      }
    } else if (!bothClosed) {
      // Partial close / noise — reset closed frame counter but keep blinkActive
      // so a sustained close followed by open still counts
      if (!s.blinkActive) s.closedFrames = 0
    }

  } else if (challenge === 'TURN_LEFT') {
    // For a left head turn (from camera's perspective), the nose moves toward
    // the subject's right side — which is the LEFT side of the mirrored image.
    // Inter-eye distance gives us a scale-invariant reference.
    if (pts.noseTipX != null && pts.leftEyeX != null && pts.rightEyeX != null) {
      const interEye = Math.abs(pts.rightEyeX - pts.leftEyeX)
      const noseToCenterRatio = (pts.noseTipX - pts.leftEyeX) / interEye
      // Nose has moved past the left-eye corner toward left → noseToCenterRatio < HEAD_TURN_FRACTION
      if (noseToCenterRatio < HEAD_TURN_FRACTION) {
        advancedChallenge = true
        s = advanceChallenge(s)
      }
    }

  } else if (challenge === 'TURN_RIGHT') {
    if (pts.noseTipX != null && pts.leftEyeX != null && pts.rightEyeX != null) {
      const interEye = Math.abs(pts.rightEyeX - pts.leftEyeX)
      const noseToCenterRatio = (pts.rightEyeX - pts.noseTipX) / interEye
      if (noseToCenterRatio < HEAD_TURN_FRACTION) {
        advancedChallenge = true
        s = advanceChallenge(s)
      }
    }
  }

  return { state: s, advancedChallenge }
}

function advanceChallenge(state: LivenessState): LivenessState {
  const nextIndex = state.challengeIndex + 1
  if (nextIndex >= state.challenges.length) {
    return { ...state, challengeIndex: nextIndex, passed: true, framesSinceChallenge: 0 }
  }
  return {
    ...state,
    challengeIndex: nextIndex,
    currentChallenge: state.challenges[nextIndex],
    framesSinceChallenge: 0,
  }
}

export function getChallengeText(challenge: LivenessChallenge): string {
  switch (challenge) {
    case 'BLINK': return 'Blink both eyes once'
    case 'TURN_LEFT': return 'Turn head left'
    case 'TURN_RIGHT': return 'Turn head right'
  }
}

export function getChallengeIcon(challenge: LivenessChallenge): string {
  switch (challenge) {
    case 'BLINK': return '👁'
    case 'TURN_LEFT': return '←'
    case 'TURN_RIGHT': return '→'
  }
}
