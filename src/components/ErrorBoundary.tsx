import { Component, type ErrorInfo, type ReactNode } from 'react'
import { projectStorageKey } from '../store/persistence'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level error boundary. Catches render/lifecycle errors anywhere below it
 * and shows a recoverable fallback instead of an unmounted white screen.
 * "Reset local data" clears the persisted state key in case a corrupt saved
 * payload is what triggers the crash on every reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for diagnostics; a real deployment would forward this to a reporter.
    console.error('Unhandled UI error caught by ErrorBoundary:', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleResetLocalData = () => {
    try {
      window.localStorage.removeItem(projectStorageKey)
    } catch (error) {
      console.error('Failed to clear persisted state:', error)
    }
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <main className="shell loading-shell">
          <section className="workspace loading-panel">
            <span className="eyebrow">Project Controls Platform</span>
            <h1>Something went wrong</h1>
            <p className="muted">
              The application hit an unexpected error. You can reload to try again. If reloading
              keeps failing, resetting locally stored data may clear a corrupt saved state.
            </p>
            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={this.handleReload}>
                Reload
              </button>
              <button className="ghost-button" type="button" onClick={this.handleResetLocalData}>
                Reset local data
              </button>
            </div>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
