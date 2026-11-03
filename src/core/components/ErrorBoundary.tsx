import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Grattitude Synergy Runtime Error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-neutral-200 rounded-xl shadow-lg p-8 text-center">
            <div className="w-12 h-12 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-neutral-900">
              Enterprise Portal Runtime Exception
            </h1>
            <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
              An unexpected fault occurred in the current view. Your offline Firestore cache and session state remain intact.
            </p>
            {this.state.error && (
              <pre className="mt-4 p-3 bg-neutral-900 text-rose-300 text-xs font-mono rounded-lg text-left overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-xs font-bold rounded-lg hover:bg-neutral-800 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Enterprise Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
