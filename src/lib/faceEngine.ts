// On-device face detection, landmark extraction and embedding
// Uses @vladmandic/face-api — the actively-maintained fork of face-api.js
import * as faceapi from '@vladmandic/face-api'

let modelsLoaded = false
let loadingPromise: Promise<void> | null = null

// @vladmandic/face-api ships its own CDN-ready weights
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model'

export async function loadModels(onProgress?: (pct: number) => void): Promise<void> {
  if (modelsLoaded) return
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    onProgress?.(10)
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
    onProgress?.(40)
    // Full 68-point landmark net (NOT the tiny one): far more accurate eyelid
    // tracking, so EAR actually collapses when eyes close — critical for blink.
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    onProgress?.(70)
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    onProgress?.(100)
    modelsLoaded = true
  })()

  return loadingPromise
}

export function isModelsLoaded() { return modelsLoaded }

export interface FaceResult {
  detected: boolean
  landmarks?: faceapi.FaceLandmarks68
  descriptor?: Float32Array
  box?: { x: number; y: number; width: number; height: number }
  earLeft: number
  earRight: number
  earAvg: number
}

/** Eye Aspect Ratio — standard Soukupová & Čech formula */
function eyeAspectRatio(pts: faceapi.Point[]): number {
  const d = (a: faceapi.Point, b: faceapi.Point) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
  // pts order for face-api 68-landmark eyes:
  // [0]=outer corner, [1]=upper-outer, [2]=upper-inner,
  // [3]=inner corner, [4]=lower-inner, [5]=lower-outer
  const A = d(pts[1], pts[5])
  const B = d(pts[2], pts[4])
  const C = d(pts[0], pts[3])
  if (C < 1) return 0.3  // degenerate — eye barely visible
  return (A + B) / (2.0 * C)
}

const NO_FACE: FaceResult = { detected: false, earLeft: 0.3, earRight: 0.3, earAvg: 0.3 }

export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement
): Promise<FaceResult> {
  if (!modelsLoaded) return NO_FACE

  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 })
  const result = await faceapi
    .detectSingleFace(input, opts)
    .withFaceLandmarks()   // full landmark model (tiny=false)
    .withFaceDescriptor()

  if (!result) return NO_FACE

  const lm = result.landmarks
  const earLeft  = eyeAspectRatio(lm.getLeftEye())
  const earRight = eyeAspectRatio(lm.getRightEye())

  return {
    detected: true,
    landmarks: lm,
    descriptor: result.descriptor,
    box: result.detection.box,
    earLeft,
    earRight,
    earAvg: (earLeft + earRight) / 2,
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, nA = 0, nB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; nA += a[i] * a[i]; nB += b[i] * b[i]
  }
  return dot / (Math.sqrt(nA) * Math.sqrt(nB))
}

export function averageEmbeddings(embs: Float32Array[]): number[] {
  const len = embs[0].length
  const avg = new Array(len).fill(0)
  for (const e of embs) for (let i = 0; i < len; i++) avg[i] += e[i]
  return avg.map(v => v / embs.length)
}
