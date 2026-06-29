import { describe, it, expect } from 'vitest'
import { fmtNum, parseMeasure } from './format'

describe('fmtNum', () => {
  it('keeps clean integers and one-decimal values', () => {
    expect(fmtNum(175)).toBe('175')
    expect(fmtNum(175.4)).toBe('175.4')
  })
  it('rounds to at most 2 decimals and strips float cruft', () => {
    expect(fmtNum(175.40000001)).toBe('175.4')
    expect(fmtNum(1 / 3)).toBe('0.33')
  })
  it('handles negatives', () => {
    expect(fmtNum(-2.5)).toBe('-2.5')
  })
})

describe('parseMeasure', () => {
  it('parses valid numbers (incl. decimals and negatives)', () => {
    expect(parseMeasure('175.4')).toBe(175.4)
    expect(parseMeasure(' 80 ')).toBe(80)
    expect(parseMeasure('-2.5')).toBe(-2.5)
  })
  it('rejects blank, zero, and non-numeric input', () => {
    expect(parseMeasure('')).toBeNull()
    expect(parseMeasure('   ')).toBeNull()
    expect(parseMeasure('0')).toBeNull()
    expect(parseMeasure('abc')).toBeNull()
  })
})
