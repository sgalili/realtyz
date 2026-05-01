import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logClientError } from '@/lib/logClientError';

interface Props {
  /** Logical region name (e.g. "DealRoom.Grid") — recorded with the error log. */
  source: string;
  children: ReactNode;
  /** Optional custom fallback. */
  fallback?: ReactNode;
  /** If true (default), automatically retry once after a short delay. */
  autoRetry?: boolean;
}

interface State {
  hasError: boolean;
  retrying: boolean;
  retryCount: number;
}

const FRIENDLY_MESSAGE = 'משהו השתבש, מנסה להתחבר מחדש...';

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retrying: false, retryCount: 0 };
  private retryTimer: number | null = null;

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logClientError({
      source: this.props.source,
      message: error.message || 'Unknown error',
      stack: error.stack,
      context: { componentStack: info.componentStack?.slice(0, 2000) ?? null },
      severity: /timeout|network|fetch/i.test(error.message) ? 'timeout' : 'error',
    });

    if (this.props.autoRetry !== false && this.state.retryCount === 0) {
      this.setState({ retrying: true });
      this.retryTimer = window.setTimeout(() => this.handleReset(), 2500);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
  }

  handleReset = () => {
    this.setState((s) => ({
      hasError: false,
      retrying: false,
      retryCount: s.retryCount + 1,
    }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        dir="rtl"
        role="alert"
        className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 flex flex-col items-center text-center gap-3"
      >
        <div className="h-12 w-12 rounded-full bg-amber-500/15 flex items-center justify-center">
          {this.state.retrying ? (
            <Loader2 className="h-6 w-6 text-amber-600 animate-spin" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          )}
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-sm">{FRIENDLY_MESSAGE}</p>
          <p className="text-xs text-muted-foreground">
            רכיב זה נכשל לטעון. הצוות קיבל התראה אוטומטית.
          </p>
        </div>
        {!this.state.retrying && (
          <Button size="sm" variant="outline" onClick={this.handleReset} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            נסה שוב
          </Button>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
