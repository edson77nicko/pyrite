import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
  fallbackMessage?: string
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Pyrite ErrorBoundary caught error]:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  handleRecovery = () => {
    try {
      localStorage.removeItem('pyrite_myteam_primary_section')
      localStorage.removeItem('pyrite_myteam_selected_workflow_id')
      localStorage.removeItem('pyrite_myteam_selected_team_id')
    } catch {}
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-8 bg-[#09090b] text-zinc-200 select-none">
          <div className="max-w-md w-full bg-[#141416] border border-zinc-800/90 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                {this.props.fallbackTitle || 'Ocorreu um erro ao carregar esta visualização'}
              </h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                {this.props.fallbackMessage ||
                  'Um estado inesperado impediu a renderização correta deste componente. Seus dados estão seguros no cofre.'}
              </p>
            </div>

            {this.state.error && (
              <div className="text-left bg-black/50 border border-zinc-800/70 rounded-xl p-3 max-h-32 overflow-y-auto text-[11px] font-mono text-rose-300/90 select-text custom-chat-scrollbar">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>

              <button
                type="button"
                onClick={this.handleRecovery}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-zinc-950 text-xs font-semibold cursor-pointer transition-all shadow-sm"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Restaurar Início</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
