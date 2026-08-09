import { Component, ErrorInfo, ReactNode } from 'react'
import { ApertureIrisIcon } from './ApertureIrisIcon'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[GalleryErrorBoundary] Uncaught UI error:', error, errorInfo)
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-void text-ink flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="p-4 rounded-full bg-rose-500/10 border border-rose-500/20 mb-4">
            <ApertureIrisIcon className="w-10 h-10 text-rose-400" />
          </div>
          <h2 className="text-lg font-bold tracking-wide text-ink mb-1">Renderer Exception Encountered</h2>
          <p className="text-xs font-mono text-ink-dim max-w-md mb-6">
            {this.state.error?.message || 'An unexpected rendering error occurred in the component tree.'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-lg bg-glow/20 text-glow border border-glow/30 hover:bg-glow/30 transition text-xs font-medium"
          >
            Reload Vantage Gallery
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
