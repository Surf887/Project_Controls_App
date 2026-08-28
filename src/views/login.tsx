import { useEffect, useState, type FormEvent } from 'react'

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>
  onSso: (idToken: string) => Promise<void>
  onDemoLogin?: (role: string) => Promise<void>
  oidcEnabled?: boolean
  oidcLoginUrl?: string
  demoAuthEnabled?: boolean
  globalError?: string | null
}

export function LoginScreen({
  onLogin,
  onSso,
  onDemoLogin,
  oidcEnabled,
  oidcLoginUrl,
  demoAuthEnabled,
  globalError,
}: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [demoRole, setDemoRole] = useState('cost_controller')
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const ssoError = params.get('sso_error')
    if (!ssoError) return
    setError(
      ssoError === 'account_link'
        ? 'SSO account linking requires administrator review.'
        : 'SSO authentication failed. Please retry or use password login.',
    )
    params.delete('sso_error')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [])

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

  async function submitDemo() {
    if (!onDemoLogin) return
    setBusy(true)
    setError(null)
    try {
      await onDemoLogin(demoRole)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed')
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
            <p className="login-error" role="alert">
              {error ?? globalError}
            </p>
          )}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {oidcEnabled && oidcLoginUrl && (
          <button
            className="ghost-button"
            type="button"
            style={{ marginTop: 12, width: '100%' }}
            disabled={busy}
            onClick={() => {
              window.location.href = oidcLoginUrl
            }}
          >
            Sign in with SSO
          </button>
        )}
        {oidcEnabled && !oidcLoginUrl && (
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            SSO configuration is incomplete; contact an administrator.
          </p>
        )}

        {demoAuthEnabled && onDemoLogin && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border, #e8e4dc)' }}>
            <p className="muted" style={{ marginBottom: 12 }}>
              Explore the workspace without credentials.
            </p>
            <label className="filter-inline" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <span>Demo role</span>
              <select
                className="select-input"
                value={demoRole}
                onChange={(e) => setDemoRole(e.target.value)}
                disabled={busy}
              >
                <option value="viewer">Viewer</option>
                <option value="cost_controller">Cost controller</option>
                <option value="approver">Approver</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button
              className="ghost-button"
              type="button"
              style={{ width: '100%' }}
              disabled={busy}
              data-testid="demo-mode-button"
              onClick={() => void submitDemo()}
            >
              {busy ? 'Starting demo…' : 'Continue in demo mode'}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
