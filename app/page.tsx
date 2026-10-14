'use client';
import { useEffect, useState } from 'react';
import KaikeiApp, { type LedgerData } from './kaikei-app';
import { installClientRuntime } from '@/lib/client-runtime';
import { createDemoRuntime, resetDemo } from '@/lib/demo-runtime';

export default function DemoPage() {
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      const demo = createDemoRuntime(localStorage);
      installClientRuntime(demo.runtime);
      setLedger(demo.snapshot());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Browser storage is unavailable.',
      );
    }
  }, []);
  const reset = () => {
    if (
      !window.confirm(
        'Reset this demo? All changes on this device, including pending demo entries, will be removed. Other websites and the private app are unaffected.',
      )
    )
      return;
    resetDemo(localStorage);
    window.location.reload();
  };
  return (
    <>
      <aside className="demo-banner" aria-label="Demo information">
        <span>
          <strong>Kaikei Demo</strong> · Fictional data · Saved only in this
          browser
        </span>
        <button type="button" onClick={reset}>
          Reset demo
        </button>
      </aside>
      {error ? (
        <section className="app-recovery" role="alert">
          <h1>Demo storage needs attention</h1>
          <p>{error}</p>
          <p>
            Existing saved data has not been discarded. Check browser storage
            permissions before continuing.
          </p>
        </section>
      ) : ledger ? (
        <KaikeiApp initialLedger={ledger} />
      ) : (
        <main className="loading-shell" aria-busy="true">
          <h1>Kaikei Demo</h1>
          <p>Opening your browser-local ledger…</p>
        </main>
      )}
    </>
  );
}
