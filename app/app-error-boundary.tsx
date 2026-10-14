'use client';

import { Component, type ReactNode } from 'react';
import { matchingShellUrl } from '@/lib/shell-recovery';

export default class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-recovery" role="alert">
        <h1>Kaikei couldn’t open this screen</h1>
        <p>
          Reload to try again. Saved recovery drafts and queued entries won’t be
          cleared. Any input not yet submitted may need to be entered again.
        </p>
        <button onClick={() => window.location.assign(matchingShellUrl())}>
          Reload the matching app version
        </button>
      </main>
    );
  }
}
