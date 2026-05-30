// Face detection and embedding engine using face-api.js
// Runs entirely in-browser — no data leaves the device

import * as faceapi from 'face-api.js'

let modelsLoaded = false
let loadingPromise: Promise<void> | null = null

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model'

export async function loadModels(onProgress?: (pct: number) => void): Promise<void> {
  if (modelsLoaded) return
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    onProgress?.(10)
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
    onProgress?.(40)
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
    onProgress?.(70)
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    onProgress?.(100)
    modelsLoaded = true
  })()

  return loadingPromise
}

export function isModelsLoaded() {
  return modelsLoaded
}

export interface FaceResult {
  detected: boolean
  landmarks?: faceapi.FaceLandmarks68
  descriptor?: Float32Array
  box?: { x: number; y: number; width: number; height: number }
  earLeft: number
  earRight: number
  earAvg: number
}

function eyeAspectRatio(pts: faceapi.Point[]): number {
  const dist = (a: faceapi.Point, b: faceapi.Point) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
  // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
  const A = dist(pts[1], pts[5])
  const B = dist(pts[2], pts[4])
  const C = dist(pts[0], pts[3])
  return (A + B) / (2 * C)
}

export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement
): Promise<FaceResult> {
  if (!modelsLoaded) return { detected: false, earLeft: 0.3, earRight: 0.3, earAvg: 0.3 }

  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
  const result = await faceapi
    .detectSingleFace(input, opts)
    .withFaceLandmarks(true)
    .withFaceDescriptor()

  if (!result) return { detected: false, earLeft: 0.3, earRight: 0.3, earAvg: 0.3 }

  const lm = result.landmarks
  const leftEyePts = lm.getLeftEye()
  const rightEyePts = lm.getRightEye()
  const earLeft = eyeAspectRatio(leftEyePts)
  const earRight = eyeAspectRatio(rightEyePts)

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
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function averageEmbeddings(embeddings: Float32Array[]): number[] {
  const len = embeddings[0].length
  const avg = new Array(len).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < len; i++) avg[i] += emb[i]
  }
  return avg.map(v => v / embeddings.length)
}

export function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0))
}
