import { describe, it, expect } from 'vitest'
import { normalizeUrl, hostLabel } from './url'

describe('normalizeUrl', () => {
  it('keeps valid http(s) URLs', () => {
    expect(normalizeUrl('https://docs.google.com/doc/1')).toBe('https://docs.google.com/doc/1')
    expect(normalizeUrl('http://example.com/')).toBe('http://example.com/')
  })
  it('prepends https:// to a bare domain', () => {
    expect(normalizeUrl('docs.google.com/doc/1')).toBe('https://docs.google.com/doc/1')
  })
  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com/')
  })
  it('rejects empty / blank input', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
  })
  it('rejects dangerous and non-web schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('data:text/html,<script>')).toBeNull()
    expect(normalizeUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeUrl('mailto:me@example.com')).toBeNull()
  })
})

describe('hostLabel', () => {
  it('returns the hostname without a leading www.', () => {
    expect(hostLabel('https://www.youtube.com/watch?v=x')).toBe('youtube.com')
    expect(hostLabel('https://docs.google.com/doc/1')).toBe('docs.google.com')
  })
  it('falls back to the input when unparseable', () => {
    expect(hostLabel('not a url')).toBe('not a url')
  })
})
