// Passive liveness: adaptive-baseline EAR blink + head-pose challenge

export type LivenessChallenge = 'BLINK' | 'TURN_LEFT' | 'TURN_RIGHT'

export interface LivenessState {
  currentChallenge: LivenessChallenge
  challengeIndex: number
  challenges: LivenessChallenge[]
  passed: boolean

  // Blink detection — adaptive baseline
  earBaseline: number        // rolling average of open-eye EAR (calibrated over first N frames)
  baselineFrames: number     // how many frames we've used to build the baseline
  closedFrames: number       // consecutive frames where EAR < close threshold
  blinkActive: boolean       // eye went below threshold and is waiting to reopen
  blinkCount: number

  // Head turn
  framesSinceChallenge: number
}

// Number of frames used to seed the open-eye baseline before accepting blinks
const BASELINE_FRAMES = 12
// Blink detected when EAR drops to (baseline * BLINK_RATIO_CLOSE)
const BLINK_RATIO_CLOSE = 0.78   // ~22% relative drop from this person's open EAR
// ...OR drops by at least this absolute amount (handles faces whose EAR range
// is naturally compressed, where a ratio alone is never reached)
const BLINK_ABS_DROP    = 0.05
// Blink completed when EAR rises back to (baseline * BLINK_RATIO_OPEN)
const BLINK_RATIO_OPEN  = 0.90
// Minimum consecutive closed frames to qualify (filters camera noise / micro-squints)
const MIN_CLOSED_FRAMES = 1
// Head turn threshold as fraction of inter-eye distance
const HEAD_TURN_FRACTION = 0.28

export function createLivenessState(randomize = true): LivenessState {
  const base: LivenessChallenge[] = ['BLINK', 'TURN_LEFT', 'TURN_RIGHT']
  const challenges = randomize ? shuffle([...base]) : base
  return {
    currentChallenge: challenges[0],
    challengeIndex: 0,
    challenges,
    passed: false,
    earBaseline: 0.28,   // sensible default; will be refined in first 20 frames
    baselineFrames: 0,
    closedFrames: 0,
    blinkActive: false,
    blinkCount: 0,
    framesSinceChallenge: 0,
  }
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface LandmarkPoints {
  earLeft: number
  earRight: number
  earAvg: number
  leftEyeX?: number   // landmark 36 x
  rightEyeX?: number  // landmark 45 x
  noseTipX?: number   // landmark 30 x
}

export function updateLiveness(
  state: LivenessState,
  pts: LandmarkPoints
): { state: LivenessState; advancedChallenge: boolean } {
  if (state.passed) return { state, advancedChallenge: false }

  let s = { ...state }
  s.framesSinceChallenge++
  let advanced = false

  // ── Phase 1: seed the open-eye EAR baseline ───────────────────────────────
  // Seed from the first frames (assume eyes start open). We deliberately seed
  // from whatever EAR we see so the baseline reflects THIS person's open value,
  // however high or low — no fixed gate that a compressed-range face can't pass.
  if (s.baselineFrames < BASELINE_FRAMES) {
    const alpha = s.baselineFrames === 0 ? 1 : 0.25
    s.earBaseline = s.earBaseline * (1 - alpha) + pts.earAvg * alpha
    s.baselineFrames++
    return { state: s, advancedChallenge: false }
  }

  // Continuously track the open-eye level: whenever the current EAR is at or
  // above the baseline, the eyes are open — nudge the baseline toward it so it
  // always reflects this person's true open EAR (handles drift / distance).
  if (pts.earAvg >= s.earBaseline) {
    s.earBaseline = s.earBaseline * 0.9 + pts.earAvg * 0.1
  }

  // ── Phase 2: challenge logic ──────────────────────────────────────────────
  const challenge = s.currentChallenge

  if (challenge === 'BLINK') {
    // Closed if EAR drops by a relative ratio OR an absolute amount — whichever
    // is easier for this face's natural range.
    const closeThreshold = Math.max(
      s.earBaseline * BLINK_RATIO_CLOSE,
      s.earBaseline - BLINK_ABS_DROP
    )
    const openThreshold  = s.earBaseline * BLINK_RATIO_OPEN

    const leftClosed  = pts.earLeft  < closeThreshold
    const rightClosed = pts.earRight < closeThreshold
    const bothClosed  = leftClosed && rightClosed

    const leftOpen  = pts.earLeft  > openThreshold
    const rightOpen = pts.earRight > openThreshold
    const bothOpen  = leftOpen && rightOpen

    if (bothClosed) {
      s.closedFrames++
      if (s.closedFrames >= MIN_CLOSED_FRAMES) {
        s.blinkActive = true
      }
    } else if (bothOpen && s.blinkActive) {
      // Reopened after confirmed close → blink complete
      s.blinkActive = false
      s.closedFrames = 0
      s.blinkCount++
      if (s.blinkCount >= 1) {
        advanced = true
        s = advance(s)
      }
    } else if (!bothClosed && !s.blinkActive) {
      // Noise / partial — reset closed counter only if not already in blink
      s.closedFrames = 0
    }

  } else if (challenge === 'TURN_LEFT') {
    if (pts.noseTipX != null && pts.leftEyeX != null && pts.rightEyeX != null) {
      const ie = Math.abs(pts.rightEyeX - pts.leftEyeX)
      if (ie > 0 && (pts.noseTipX - pts.leftEyeX) / ie < HEAD_TURN_FRACTION) {
        advanced = true; s = advance(s)
      }
    }

  } else if (challenge === 'TURN_RIGHT') {
    if (pts.noseTipX != null && pts.leftEyeX != null && pts.rightEyeX != null) {
      const ie = Math.abs(pts.rightEyeX - pts.leftEyeX)
      if (ie > 0 && (pts.rightEyeX - pts.noseTipX) / ie < HEAD_TURN_FRACTION) {
        advanced = true; s = advance(s)
      }
    }
  }

  return { state: s, advancedChallenge: advanced }
}

function advance(s: LivenessState): LivenessState {
  const next = s.challengeIndex + 1
  if (next >= s.challenges.length) {
    return { ...s, challengeIndex: next, passed: true, framesSinceChallenge: 0 }
  }
  return { ...s, challengeIndex: next, currentChallenge: s.challenges[next], framesSinceChallenge: 0 }
}

export function getChallengeText(c: LivenessChallenge): string {
  switch (c) {
    case 'BLINK':      return 'Blink both eyes'
    case 'TURN_LEFT':  return 'Turn head left'
    case 'TURN_RIGHT': return 'Turn head right'
  }
}

export function getChallengeIcon(c: LivenessChallenge): string {
  switch (c) {
    case 'BLINK':      return '👁'
    case 'TURN_LEFT':  return '←'
    case 'TURN_RIGHT': return '→'
  }
}
