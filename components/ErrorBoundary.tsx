import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error,
      errorInfo: null 
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 ErrorBoundary capturó un error:');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // Fallback personalizado si se proporciona
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-white dark:bg-zinc-900 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                <span className="text-red-600 dark:text-red-400 text-xl">🚨</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">Error en la navegación</h2>
                <p className="text-sm text-red-600 dark:text-red-400">{this.state.error?.message || 'Error desconocido'}</p>
              </div>
            </div>
            
            <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Detalles técnicos:</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2 font-mono break-all">
                {this.state.error?.message || 'Error desconocido'}
              </p>
              {this.state.errorInfo && (
                <details className="text-xs text-zinc-500 dark:text-zinc-500">
                  <summary className="cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
                    Stack trace completo
                  </summary>
                  <pre className="mt-2 p-2 bg-zinc-50 dark:bg-zinc-900 rounded overflow-auto max-h-32 text-xs">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Recargar página
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm font-medium rounded-lg transition-colors"
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}