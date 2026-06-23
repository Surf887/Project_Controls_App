import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as api from '../api/client'
import { projectReducer } from './projectReducer'
import { clearProjectState, loadProjectState, saveProjectState } from './persistence'
import { createSeedState } from './seedState'
import type { ProjectAction, ProjectState } from './types'

interface ProjectStoreValue {
  state: ProjectState
  dispatch: (action: ProjectAction) => void
  resetProject: () => Promise<void>
  switchProject: (projectId: string) => Promise<void>
  reconnect: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  loginSso: (idToken: string) => Promise<void>
  logout: () => void
  ready: boolean
  error: string | null
  syncing: boolean
  backendEnabled: boolean
  authRequired: boolean
  currentUser: api.AuthUser | null
  authConfig: api.AuthConfig | null
  projects: api.ProjectSummary[]
}

const ProjectStoreContext = createContext<ProjectStoreValue | null>(null)

/** Thrown internally when the backend is reachable but the caller must log in. */
class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required')
    this.name = 'AuthRequiredError'
  }
}

function demoRole(): string {
  return typeof localStorage !== 'undefined' ? localStorage.getItem('pc-role') ?? 'cost_controller' : 'cost_controller'
}

export function ProjectStoreProvider({ children }: { children: ReactNode }) {
  const [state, baseDispatch] = useReducer(projectReducer, createSeedState())
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [backendEnabled, setBackendEnabled] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [currentUser, setCurrentUser] = useState<api.AuthUser | null>(() => api.getStoredUser())
  const [authConfig, setAuthConfig] = useState<api.AuthConfig | null>(null)
  const [projects, setProjects] = useState<api.ProjectSummary[]>([])
  const backendRef = useRef(false)
  const pendingRef = useRef<Promise<void>>(Promise.resolve())
  const actionSeqRef = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state
  // Timer that proactively expires the session at the token's expiry.
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the local session and route the user back to the login screen. Used
  // both for proactive expiry (timer) and for the expired-before-action check.
  const expireSession = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = null
    }
    api.clearAuthSession()
    backendRef.current = false
    setBackendEnabled(false)
    setCurrentUser(null)
    setAuthRequired(true)
    setError('Your session has expired — please sign in again.')
  }, [])

  // Arm a one-shot timer to proactively clear the session at (or just before)
  // expiry, so the next action shows a clear "session expired" prompt rather
  // than a silent 401. No backend refresh endpoint exists, so we only detect.
  const scheduleExpiry = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = null
    }
    const expiry = api.getSessionExpiry()
    if (expiry === null) return
    // Fire ~5s early (clamped to >= 0) to avoid racing an in-flight request.
    const delay = Math.max(0, expiry - Date.now() - 5000)
    expiryTimerRef.current = setTimeout(() => {
      if (backendRef.current) {
        expireSession()
      }
    }, delay)
  }, [expireSession])

  const hydrate = useCallback((next: ProjectState) => {
    baseDispatch({ type: 'HYDRATE', payload: next })
  }, [])

  // Connects to the API, establishing/validating a session. Throws
  // AuthRequiredError when the backend is up but no valid credentials exist.
  const connectBackend = useCallback(async () => {
    await api.checkHealth()

    // Fetch fresh each connect; stored in state only for the login UI. Not read
    // from state here, so this callback stays stable (avoids a bootstrap loop).
    let config: api.AuthConfig | null = null
    try {
      config = await api.getAuthConfig()
      setAuthConfig(config)
    } catch {
      /* config endpoint optional — proceed with what we know */
    }

    if (!api.hasToken()) {
      if (config?.demoAuthEnabled) {
        await api.signIn(demoRole()).catch(() => undefined)
      } else {
        throw new AuthRequiredError()
      }
    }

    try {
      const [list, active] = await Promise.all([api.listProjects(), api.getProject()])
      backendRef.current = true
      setBackendEnabled(true)
      setProjects(list)
      hydrate(active)
      setCurrentUser(api.getStoredUser())
      setAuthRequired(false)
      setError(null)
      scheduleExpiry()
    } catch (loadError) {
      if (loadError instanceof api.ApiError && loadError.status === 401) {
        api.clearAuthSession()
        backendRef.current = false
        setBackendEnabled(false)
        setCurrentUser(null)
        throw new AuthRequiredError()
      }
      throw loadError
    }
  }, [hydrate, scheduleExpiry])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        await connectBackend()
        if (cancelled) return
        setAuthRequired(false)
        setReady(true)
      } catch (bootstrapError) {
        if (cancelled) return

        if (bootstrapError instanceof AuthRequiredError) {
          // Backend is reachable but we need credentials — show the login
          // screen instead of silently falling back to local storage.
          backendRef.current = false
          setBackendEnabled(false)
          setAuthRequired(true)
          setReady(true)
          return
        }

        // Backend unreachable — work offline against local storage.
        backendRef.current = false
        setBackendEnabled(false)
        setAuthRequired(false)
        hydrate(loadProjectState())
        setProjects([
          {
            id: loadProjectState().meta.id,
            name: loadProjectState().meta.name,
            baselineLabel: loadProjectState().meta.baselineLabel,
            updatedAt: new Date().toISOString(),
          },
        ])
        setError(bootstrapError instanceof Error ? bootstrapError.message : 'Backend unavailable — using local storage.')
        setReady(true)
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [connectBackend, hydrate])

  useEffect(() => {
    if (!ready || backendRef.current) return
    saveProjectState(state)
  }, [ready, state])

  // Clear any pending expiry timer when the provider unmounts.
  useEffect(() => {
    return () => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current)
        expiryTimerRef.current = null
      }
    }
  }, [])

  const dispatch = useCallback(
    (action: ProjectAction) => {
      if (action.type === 'HYDRATE') {
        baseDispatch(action)
        return
      }

      if (!backendRef.current) {
        baseDispatch(action)
        return
      }

      // If the session has already expired, don't fire an action that would come
      // back as a silent 401 — clear the session and prompt re-login up front.
      if (api.isSessionExpired()) {
        expireSession()
        return
      }

      const seq = ++actionSeqRef.current

      pendingRef.current = pendingRef.current
        .then(async () => {
          setSyncing(true)
          try {
            const next = await api.dispatchAction(stateRef.current.meta.id, action)
            if (seq !== actionSeqRef.current) {
              return
            }
            hydrate(next)
          } catch (dispatchError) {
            if (seq !== actionSeqRef.current) {
              return
            }
            if (dispatchError instanceof api.ApiError && dispatchError.status === 401) {
              api.clearAuthSession()
              backendRef.current = false
              setBackendEnabled(false)
              setCurrentUser(null)
              setAuthRequired(true)
              setError('Session expired — please sign in again.')
              return
            }
            // 409 = optimistic-concurrency conflict: the project changed on the
            // server since we last loaded it, so our edit was rejected (not
            // applied). Surface a distinct message and reload the latest version
            // so the user knows to re-apply their change, rather than treating it
            // like a generic transient sync failure.
            const isConflict = dispatchError instanceof api.ApiError && dispatchError.status === 409
            setError(
              isConflict
                ? 'This project changed elsewhere — reloaded the latest version; please re-apply your edit.'
                : dispatchError instanceof Error
                  ? dispatchError.message
                  : 'Sync failed — refresh or retry.',
            )
            try {
              const fresh = await api.getProject(stateRef.current.meta.id)
              if (seq === actionSeqRef.current) {
                hydrate(fresh)
              }
            } catch {
              /* keep last known good state */
            }
          } finally {
            if (seq === actionSeqRef.current) {
              setSyncing(false)
            }
          }
        })
        .catch(() => undefined)
    },
    [hydrate, expireSession],
  )

  const resetProject = useCallback(async () => {
    if (backendRef.current) {
      setSyncing(true)
      try {
        const next = await api.resetProject(stateRef.current.meta.id)
        hydrate(next)
        const list = await api.listProjects()
        setProjects(list)
      } finally {
        setSyncing(false)
      }
      return
    }

    clearProjectState()
    baseDispatch({ type: 'RESET', payload: createSeedState() })
  }, [hydrate])

  const switchProject = useCallback(
    async (projectId: string) => {
      if (!backendRef.current) return
      setSyncing(true)
      try {
        const next = await api.activateProject(projectId)
        hydrate(next)
        const list = await api.listProjects()
        setProjects(list)
      } finally {
        setSyncing(false)
      }
    },
    [hydrate],
  )

  const reconnect = useCallback(async () => {
    setSyncing(true)
    try {
      await connectBackend()
      setAuthRequired(false)
    } catch (reconnectError) {
      if (reconnectError instanceof AuthRequiredError) {
        setAuthRequired(true)
        return
      }
      setError(reconnectError instanceof Error ? reconnectError.message : 'Could not reconnect to API.')
    } finally {
      setSyncing(false)
    }
  }, [connectBackend])

  const login = useCallback(
    async (email: string, password: string) => {
      await api.loginWithPassword(email, password)
      setError(null)
      await connectBackend()
      setReady(true)
    },
    [connectBackend],
  )

  const loginSso = useCallback(
    async (idToken: string) => {
      await api.loginWithOidc(idToken)
      setError(null)
      await connectBackend()
      setReady(true)
    },
    [connectBackend],
  )

  const logout = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = null
    }
    api.clearAuthSession()
    backendRef.current = false
    setBackendEnabled(false)
    setCurrentUser(null)
    setProjects([])
    setAuthRequired(true)
    setError(null)
  }, [])

  const value = useMemo(
    () => ({
      state,
      dispatch,
      resetProject,
      switchProject,
      reconnect,
      login,
      loginSso,
      logout,
      ready,
      error,
      syncing,
      backendEnabled,
      authRequired,
      currentUser,
      authConfig,
      projects,
    }),
    [
      state,
      dispatch,
      resetProject,
      switchProject,
      reconnect,
      login,
      loginSso,
      logout,
      ready,
      error,
      syncing,
      backendEnabled,
      authRequired,
      currentUser,
      authConfig,
      projects,
    ],
  )

  return <ProjectStoreContext.Provider value={value}>{children}</ProjectStoreContext.Provider>
}

export function useProjectStore() {
  const context = useContext(ProjectStoreContext)
  if (!context) {
    throw new Error('useProjectStore must be used within ProjectStoreProvider')
  }
  return context
}
