import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-800 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-600 mb-6">
            The page hit an unexpected problem. Your data is safe. Reloading
            usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
