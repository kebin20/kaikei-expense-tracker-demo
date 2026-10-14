/* oxlint-disable next/no-img-element */

export default function Loading() {
  return (
    <main className="instant-loading-shell" aria-label="Loading Kaikei">
      <header>
        <img
          src="/icons/icon-wallet-v21-128.png"
          alt=""
          width={52}
          height={52}
        />
        <div>
          <strong>Kaikei</strong>
          <span>Getting your latest snapshot ready…</span>
        </div>
      </header>
      <section aria-hidden="true">
        <div className="instant-loading-title" />
        <div className="instant-loading-balance" />
        <div className="instant-loading-cards">
          <div />
          <div />
        </div>
      </section>
    </main>
  );
}
