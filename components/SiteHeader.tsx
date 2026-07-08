import type { ReactNode } from 'react';
import Link from 'next/link';

interface Props {
  center?: ReactNode;
  right?: ReactNode;
  srTitle?: string;
  logoAsLink?: boolean;
}

export default function SiteHeader({ center, right, srTitle, logoAsLink = true }: Props) {
  return (
    <header>
      {srTitle && <h1 className="sr-only">{srTitle}</h1>}
      {logoAsLink ? (
        <Link href="/" className="logo" style={{ textDecoration: 'none' }}>
          NewsHUB
        </Link>
      ) : (
        <span className="logo">NewsHUB</span>
      )}
      {center && <span className="header-center">{center}</span>}
      {right && <div className="header-right">{right}</div>}
    </header>
  );
}
