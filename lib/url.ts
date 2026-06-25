// URL handling for tracker resources. Keep this strict: a resource link becomes
// an href we render with target="_blank", so we must reject non-web schemes
// (javascript:, data:, file:, …) that could be abused.

// Normalize a user-entered link to a safe http(s) URL string, or null if it
// can't be made into one. A bare domain ("docs.google.com/…") gets https://.
export function normalizeUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  // Prepend https:// unless the user already typed a scheme (e.g. "http://").
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? raw : `https://${raw}`)
  } catch {
    return null
  }
  // Web links only — block javascript:, data:, file:, mailto:, etc.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return parsed.toString()
}

// A short display label for a URL: its hostname without a leading "www.".
// Falls back to the raw string if it can't be parsed.
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
