import { Component, ErrorInfo, ReactNode } from "react"

type Props = { children: ReactNode }
type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: "24px", fontFamily: "sans-serif", maxWidth: "640px" }}>
          <h1 style={{ color: "#b91c1c" }}>Something went wrong</h1>
          <pre style={{ background: "#f3f4f6", padding: "16px", overflow: "auto", fontSize: "14px" }}>
            {this.state.error.message}
          </pre>
          <p style={{ color: "#6b7280", marginTop: "16px" }}>
            Check the browser console for details. Fix the error and refresh.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
