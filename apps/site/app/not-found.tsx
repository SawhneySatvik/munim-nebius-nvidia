import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <header className="page-head ruled margin-line entry-card">
        <p className="eyebrow">404</p>
        <h1 className="display">This page is not in the ledger.</h1>
        <p className="lede">The address may be mistyped, or the page has moved.</p>
        <div className="cta-row">
          <Link href="/" className="btn btn-primary">
            Go home
          </Link>
          <Link href="/developers" className="btn btn-secondary">
            Developer portal
          </Link>
        </div>
      </header>
    </div>
  );
}
