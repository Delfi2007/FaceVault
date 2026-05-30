import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'

export interface CameraViewHandle {
  getVideo: () => HTMLVideoElement | null
  captureFrame: () => ImageData | null
}

interface Props {
  onStream?: (active: boolean) => void
  className?: string
  mirror?: boolean
}

const CameraView = forwardRef<CameraViewHandle, Props>(({ onStream, className = '', mirror = true }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useImperativeHandle(ref, () => ({
    getVideo: () => videoRef.current,
    captureFrame: () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return null
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      if (mirror) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height)
    },
  }))

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        onStream?.(true)
      }
    } catch {
      onStream?.(false)
    }
  }, [onStream])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      onStream?.(false)
    }
  }, [startCamera, onStream])

  return (
    <video
      ref={videoRef}
      className={`${mirror ? 'mirror' : ''} ${className}`}
      playsInline
      muted
      autoPlay
    />
  )
})

CameraView.displayName = 'CameraView'
export default CameraView
