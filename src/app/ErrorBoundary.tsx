import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/shared/Button';

/**
 * Development error boundary.
 *
 * Learners never see a stack trace or an internal message. In development the
 * detail is printed to the console; in production the screen stays calm and
 * offers a way forward, which is also what keeps one broken route from taking
 * down the whole app.
 */
interface Props {
  readonly children: ReactNode;
  readonly fallbackTitle?: string;
}

interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Muscle Atlas] Unhandled error in interface', error, info.componentStack);
  }

  private readonly handleReset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <main
        style={{
          padding: 'var(--space-8)',
          maxWidth: '44rem',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h1>{this.props.fallbackTitle ?? 'Something went wrong on this screen'}</h1>
        <p className="prose">
          This part of the app stopped unexpectedly. Your study progress is saved on this device and
          has not been lost.
        </p>
        <div>
          <Button variant="primary" onClick={this.handleReset}>
            Try this screen again
          </Button>
        </div>
        {import.meta.env.DEV ? (
          <details>
            <summary>Developer detail</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>{error.message}</pre>
          </details>
        ) : null}
      </main>
    );
  }
}
