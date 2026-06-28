import { Component, type ErrorInfo, type ReactNode } from 'react';

// A render error inside a screen (or a failed lazy-chunk fetch) would otherwise
// unmount the whole app to a blank page. This boundary catches it and shows a
// recoverable panel instead. It is keyed by the active screen in Portal, so
// navigating to another tab clears a stuck error automatically.
//
// The common intermittent case is a code-split chunk that 404s after a redeploy:
// the cached index.html still points at the previous build's chunk hashes. We
// detect that and offer a reload, which fetches the fresh index and chunks.

interface Props {
  children: ReactNode;
  // Optional override so a parent can reset the boundary when this value changes.
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

function isChunkLoadError(error: Error): boolean {
  const msg = `${error.name} ${error.message}`;
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Clear the error when the parent swaps in a new screen.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface it in the console for debugging; the panel is what the user sees.
    console.error('Screen error boundary caught:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    return (
      <div
        style={{
          maxWidth: 560,
          margin: '40px auto',
          padding: '26px 28px',
          color: '#eef3ff',
          background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
          border: '1px solid rgba(255,255,255,.12)',
          borderLeft: '3px solid #ef5468',
          borderRadius: 14,
          animation: 'fadeIn .25s ease',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
          {chunk ? 'A new version is available' : 'Something went wrong'}
        </h2>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#d7ccff' }}>
          {chunk
            ? 'This screen could not finish loading — usually because the app was updated since you opened it. Reloading will pull the latest version.'
            : 'This screen ran into an error and could not be displayed. You can try again, or reload the app.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              border: 'none',
              background: 'linear-gradient(90deg,#7c5cff,#a78bfa)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              padding: '11px 18px',
              borderRadius: 8,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Reload app
          </button>
          {!chunk && (
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                border: '1px solid rgba(255,255,255,.18)',
                background: 'rgba(255,255,255,.05)',
                color: '#cdbcff',
                fontSize: 13,
                fontWeight: 600,
                padding: '11px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
}
