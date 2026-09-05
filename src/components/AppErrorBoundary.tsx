import { Component, type ErrorInfo, type ReactNode } from "react";
import { desktopUiText } from "../i18n";

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
    const t = (key: string) => desktopUiText(document.documentElement.lang, key);
    return (
      <section className={this.props.root ? "app-error-boundary is-root" : "app-error-boundary"} role="alert">
        <strong>{t("errorBoundary.title")}</strong>
        <p>{this.props.root ? t("errorBoundary.root") : t("errorBoundary.tab")}</p>
        <code>{this.state.error.message}</code>
        <div>
          <button type="button" onClick={this.retry}>{t("errorBoundary.retry")}</button>
          <button type="button" onClick={this.copyDetails}>{t("errorBoundary.copy")}</button>
          {this.props.root && <button type="button" onClick={() => window.location.reload()}>{t("errorBoundary.reload")}</button>}
        </div>
      </section>
    );
  }
}
