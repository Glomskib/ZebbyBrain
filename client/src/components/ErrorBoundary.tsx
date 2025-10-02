import { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("UI Error:", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-background">
        <div className="max-w-md w-full space-y-4 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-2xl font-semibold text-foreground">Something went wrong</h2>
          <p className="text-muted-foreground">
            Please refresh the page. If this keeps happening, contact support with the timestamp:
          </p>
          <p className="text-sm font-mono text-muted-foreground bg-muted p-2 rounded">
            {new Date().toISOString()}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            data-testid="button-reload"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
