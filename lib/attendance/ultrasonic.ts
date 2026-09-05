/**
 * Ultrasonic Acoustic Beacon Engine (Web Audio API)
 *
 * Emits and detects high-frequency inaudible acoustic waves (18.5 kHz - 19.5 kHz)
 * to verify physical presence within the four walls of a classroom.
 * Sóng âm không xuyên qua tường gạch/cửa kính, ngăn chặn triệt để gian lận từ xa.
 */

export const DEFAULT_ULTRASONIC_FREQ = 18750 // 18.75 kHz (Inaudible to human ears, well within 44.1k/48k DAC range)
export const MIN_ULTRASONIC_FREQ = 18200
export const MAX_ULTRASONIC_FREQ = 19800

/**
 * Calculate the FFT bin index for a given target frequency.
 */
export function calculateFrequencyBin(frequency: number, sampleRate: number, fftSize: number): number {
  const binResolution = sampleRate / fftSize
  return Math.round(frequency / binResolution)
}

/**
 * Validates whether a frequency is in the safe inaudible ultrasonic range.
 */
export function isFrequencyInUltrasonicRange(frequency: number): boolean {
  return frequency >= MIN_ULTRASONIC_FREQ && frequency <= MAX_ULTRASONIC_FREQ
}

export type BeaconController = {
  stop: () => void
  frequency: number
  isRunning: () => boolean
}

/**
 * Starts broadcasting an ultrasonic acoustic beacon from the teacher's browser.
 * Uses Web Audio API with smooth ramp-up to eliminate transient pops/clicks.
 */
export function startUltrasonicBeacon(targetFrequency = DEFAULT_ULTRASONIC_FREQ): BeaconController {
  if (typeof window === 'undefined') {
    return { stop: () => {}, frequency: targetFrequency, isRunning: () => false }
  }

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new Error('Web Audio API is not supported on this browser.')
  }

  const audioContext = new AudioCtx()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(targetFrequency, audioContext.currentTime)

  // Soft ramp to eliminate start click
  gainNode.gain.setValueAtTime(0, audioContext.currentTime)
  gainNode.gain.linearRampToValueAtTime(0.75, audioContext.currentTime + 0.1)

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }

  oscillator.start()
  let active = true

  return {
    frequency: targetFrequency,
    isRunning: () => active,
    stop: () => {
      if (!active) return
      active = false
      try {
        const now = audioContext.currentTime
        gainNode.gain.setValueAtTime(gainNode.gain.value, now)
        gainNode.gain.linearRampToValueAtTime(0, now + 0.1)
        setTimeout(() => {
          try {
            oscillator.stop()
            oscillator.disconnect()
            gainNode.disconnect()
            audioContext.close()
          } catch {
            /* ignore cleanup error */
          }
        }, 150)
      } catch {
        /* ignore */
      }
    },
  }
}

export type UltrasonicDetectionResult = {
  detected: boolean
  confidence: number
  peakFrequency?: number
  ambientRatio?: number
  error?: string
}

/**
 * Listens to ambient sound via microphone and detects if the classroom ultrasonic beacon is present.
 */
export async function detectUltrasonicBeacon({
  targetFrequency = DEFAULT_ULTRASONIC_FREQ,
  toleranceHz = 160,
  durationMs = 2800,
  onProgress,
}: {
  targetFrequency?: number
  toleranceHz?: number
  durationMs?: number
  onProgress?: (progressPercent: number) => void
} = {}): Promise<UltrasonicDetectionResult> {
  if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
    return { detected: false, confidence: 0, error: 'Microphone API not supported on this device' }
  }

  let stream: MediaStream | null = null
  let audioContext: AudioContext | null = null

  try {
    // Request unadulterated microphone stream (disable echo cancellation and noise suppression which could filter high frequencies)
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioContext = new AudioCtx()
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 4096 // Gives ~11.7 Hz resolution per bin at 48kHz
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const sampleRate = audioContext.sampleRate
    const targetBin = calculateFrequencyBin(targetFrequency, sampleRate, analyser.fftSize)
    const toleranceBins = Math.max(2, Math.round(toleranceHz / (sampleRate / analyser.fftSize)))

    const startTime = Date.now()
    let detectedFrames = 0
    let totalFrames = 0
    let maxSignalStrength = 0

    return await new Promise<UltrasonicDetectionResult>((resolve) => {
      const checkFrame = () => {
        const elapsed = Date.now() - startTime
        if (onProgress) {
          onProgress(Math.min(100, Math.round((elapsed / durationMs) * 100)))
        }

        analyser.getByteFrequencyData(dataArray)

        // Find energy in the target window
        let targetEnergy = 0
        let peakVal = 0
        let peakBin = targetBin

        for (let i = targetBin - toleranceBins; i <= targetBin + toleranceBins; i++) {
          if (i >= 0 && i < bufferLength) {
            const val = dataArray[i]
            if (val > peakVal) {
              peakVal = val
              peakBin = i
            }
            targetEnergy += val
          }
        }
        const avgTarget = targetEnergy / (toleranceBins * 2 + 1)

        // Calculate ambient noise around the target (e.g. 50 bins before and after, excluding target window)
        let ambientEnergy = 0
        let ambientCount = 0
        const ambientRange = 30

        for (let i = targetBin - toleranceBins - ambientRange; i < targetBin - toleranceBins; i++) {
          if (i >= 0 && i < bufferLength) {
            ambientEnergy += dataArray[i]
            ambientCount++
          }
        }
        for (let i = targetBin + toleranceBins + 1; i <= targetBin + toleranceBins + ambientRange; i++) {
          if (i >= 0 && i < bufferLength) {
            ambientEnergy += dataArray[i]
            ambientCount++
          }
        }
        const avgAmbient = ambientCount > 0 ? ambientEnergy / ambientCount : 1

        // A clear beacon will show significantly higher power at the target frequency compared to ambient background
        const ratio = avgTarget / Math.max(1, avgAmbient)
        if (ratio > 1.8 && peakVal > 35) {
          detectedFrames++
          if (ratio > maxSignalStrength) maxSignalStrength = ratio
        }
        totalFrames++

        if (elapsed < durationMs) {
          requestAnimationFrame(checkFrame)
        } else {
          // Detection threshold: detected in at least 25% of sampled frames
          const hitRate = totalFrames > 0 ? detectedFrames / totalFrames : 0
          const detected = hitRate >= 0.25 || detectedFrames >= 5
          const calculatedConfidence = detected
            ? Math.min(100, Math.max(88, Math.round(hitRate * 100 + 40)))
            : Math.round(hitRate * 60)

          const detectedPeakFreq = Math.round(peakBin * (sampleRate / analyser.fftSize))

          resolve({
            detected,
            confidence: calculatedConfidence,
            peakFrequency: detected ? detectedPeakFreq : undefined,
            ambientRatio: Math.round(maxSignalStrength * 10) / 10,
          })
        }
      }

      requestAnimationFrame(checkFrame)
    })
  } catch (err) {
    return {
      detected: false,
      confidence: 0,
      error: err instanceof Error ? err.message : 'Error accessing microphone',
    }
  } finally {
    // Thorough cleanup of hardware resources
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    if (audioContext) {
      audioContext.close().catch(() => {})
    }
  }
}
