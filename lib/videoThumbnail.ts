/**
 * Capture a frame from a video URL and return it as a File (JPEG).
 * Uses a hidden <video> + <canvas> to grab a frame at `timeSeconds`.
 */
export async function captureVideoThumbnail(
  videoUrl: string,
  timeSeconds = 1
): Promise<File | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }

    video.onloadedmetadata = () => {
      // Clamp seek time to video duration
      const seekTo = Math.min(timeSeconds, video.duration * 0.25)
      video.currentTime = seekTo
    }

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          cleanup()
          resolve(null)
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            cleanup()
            if (!blob) {
              resolve(null)
              return
            }
            const file = new File(
              [blob],
              `video-thumb-${Date.now()}.jpg`,
              { type: 'image/jpeg' }
            )
            resolve(file)
          },
          'image/jpeg',
          0.85
        )
      } catch {
        // CORS or tainted canvas
        cleanup()
        resolve(null)
      }
    }

    video.onerror = () => {
      cleanup()
      resolve(null)
    }

    // Timeout after 10 seconds
    setTimeout(() => {
      cleanup()
      resolve(null)
    }, 10000)

    video.src = videoUrl
  })
}
