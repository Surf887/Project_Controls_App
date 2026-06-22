import { useEffect, useState, type FormEvent } from 'react'

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>
  onSso: (idToken: string) => Promise<void>
  oidcEnabled?: boolean
  globalError?: string | null
}

// Optional SSO entry point. If your IdP is configured to redirect back with an
// id_token in the URL fragment, the app will pick it up automatically on load.
const SSO_LOGIN_URL = import.meta.env.VITE_OIDC_LOGIN_URL as string | undefined

export function LoginScreen({ onLogin, onSso, oidcEnabled, globalError }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle an SSO redirect that returns `#id_token=...` in the URL fragment.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash) return
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const idToken = params.get('id_token')
    if (!idToken) return
    setBusy(true)
    onSso(idToken)
      .then(() => {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'SSO sign-in failed'))
      .finally(() => setBusy(false))
  }, [onSso])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onLogin(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell loading-shell">
      <section className="workspace loading-panel" style={{ maxWidth: 420, margin: '0 auto' }}>
        <span className="eyebrow">Project Controls Platform</span>
        <h1>Sign in</h1>
        <p className="muted">Use your account credentials to access the controls workspace.</p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <label className="filter-inline" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Email</span>
            <input
              className="select-input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="filter-inline" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Password</span>
            <input
              className="select-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </label>

          {(error || globalError) && (
            <p className="muted" role="alert" style={{ color: 'var(--danger, #c0392b)' }}>
              {error ?? globalError}
            </p>
          )}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {oidcEnabled && SSO_LOGIN_URL && (
          <button
            className="ghost-button"
            type="button"
            style={{ marginTop: 12, width: '100%' }}
            disabled={busy}
            onClick={() => {
              window.location.href = SSO_LOGIN_URL
            }}
          >
            Sign in with SSO
          </button>
        )}
        {oidcEnabled && !SSO_LOGIN_URL && (
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            SSO is available — set VITE_OIDC_LOGIN_URL to enable the SSO button.
          </p>
        )}
      </section>
    </main>
  )
}
