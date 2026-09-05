import { describe, expect, it } from 'vitest'
import {
  calculateFrequencyBin,
  DEFAULT_ULTRASONIC_FREQ,
  isFrequencyInUltrasonicRange,
  MAX_ULTRASONIC_FREQ,
  MIN_ULTRASONIC_FREQ,
} from './ultrasonic'

describe('ultrasonic engine helper functions', () => {
  it('correctly calculates the FFT frequency bin index for 44.1 kHz sample rate', () => {
    const sampleRate = 44100
    const fftSize = 4096
    const bin = calculateFrequencyBin(DEFAULT_ULTRASONIC_FREQ, sampleRate, fftSize)
    // resolution = 44100 / 4096 ≈ 10.7666 Hz
    // 18750 / 10.7666 ≈ 1741.45 -> 1741
    expect(bin).toBe(1741)
  })

  it('correctly calculates the FFT frequency bin index for 48 kHz sample rate', () => {
    const sampleRate = 48000
    const fftSize = 4096
    const bin = calculateFrequencyBin(DEFAULT_ULTRASONIC_FREQ, sampleRate, fftSize)
    // resolution = 48000 / 4096 = 11.71875 Hz
    // 18750 / 11.71875 = 1600
    expect(bin).toBe(1600)
  })

  it('accurately validates ultrasonic frequency range bounds', () => {
    expect(isFrequencyInUltrasonicRange(18750)).toBe(true)
    expect(isFrequencyInUltrasonicRange(MIN_ULTRASONIC_FREQ)).toBe(true)
    expect(isFrequencyInUltrasonicRange(MAX_ULTRASONIC_FREQ)).toBe(true)

    // Audible frequencies must return false
    expect(isFrequencyInUltrasonicRange(1000)).toBe(false)
    expect(isFrequencyInUltrasonicRange(440)).toBe(false)
    expect(isFrequencyInUltrasonicRange(16000)).toBe(false)

    // Too high frequencies must return false
    expect(isFrequencyInUltrasonicRange(24000)).toBe(false)
  })
})
