import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
  scope: string;
  resetKey?: unknown;
  root?: boolean;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: asError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[render:${this.props.scope}]`, error, info.componentStack);
  }

  componentDidUpdate(previous: AppErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  private copyDetails = () => {
    const details = this.state.error?.stack || this.state.error?.message || "Unknown render error";
    void navigator.clipboard?.writeText(details).catch((error) => {
      console.error(`[render:${this.props.scope}:copy]`, error);
    });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className={this.props.root ? "app-error-boundary is-root" : "app-error-boundary"} role="alert">
        <strong>这个界面暂时出了问题</strong>
        <p>{this.props.root ? "应用外壳已保留，请重试或重新载入。" : "其他页签仍可使用；切换页签或点击重试即可恢复。"}</p>
        <code>{this.state.error.message}</code>
        <div>
          <button type="button" onClick={this.retry}>重试</button>
          <button type="button" onClick={this.copyDetails}>复制错误</button>
          {this.props.root && <button type="button" onClick={() => window.location.reload()}>重新载入</button>}
        </div>
      </section>
    );
  }
}
