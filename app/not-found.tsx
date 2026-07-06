/**
 * app/not-found.tsx
 *
 * Global 404 — shown for any unmatched route (e.g. /category/nonexistent).
 * Server component, Hebrew RTL, styled to match the rest of the site.
 */

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-code">404</div>
      <h1 className="not-found-title">העמוד לא נמצא</h1>
      <p className="not-found-sub">העמוד שחיפשת לא קיים או הוסר</p>
      <Link href="/" className="panel-cta">
        חזרה לדף הבית
      </Link>
    </div>
  );
}
