'use client'

import { useState } from 'react'
import { signInWithGoogle } from '@/lib/useUser'

export default function SignInScreen() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
      // On success the browser redirects to Google; nothing else runs here.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start sign-in.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-5xl">📋</div>
      <h1 className="text-2xl font-bold tracking-tight">Tracker</h1>
      <p className="mb-8 mt-1 text-sm text-zinc-500">
        Tap to log anything — drinks, habits, anything. Sign in so your data
        follows you across every device.
      </p>

      <button
        onClick={go}
        disabled={busy}
        className="flex items-center gap-3 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-50"
      >
        <GoogleIcon />
        {busy ? 'Redirecting…' : 'Sign in with Google'}
      </button>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
