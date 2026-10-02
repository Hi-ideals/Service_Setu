import { Link } from 'react-router-dom';
import clsx from 'clsx';

export default function Logo({ to = '/', className, showWordmark = true }) {
  return (
    <Link to={to} className={clsx('inline-flex items-center gap-2', className)} aria-label="ServiceSetu home">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0 drop-shadow-sm" aria-hidden="true">
        {/* A gradient tile rather than a flat one: the mark is the only place
            the brand appears at full saturation, so it carries the depth. */}
        <defs>
          <linearGradient id="setu-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#12907A" />
            <stop offset="100%" stopColor="#0B6352" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8.5" fill="url(#setu-mark)" />
        <path
          d="M10 21c0-3.3 2.7-6 6-6s6-2.7 6-6"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="10" cy="21" r="2.6" fill="white" />
        <circle cx="22" cy="9" r="2.6" fill="white" />
      </svg>
      {showWordmark && (
        <span className="text-lg font-bold tracking-tight text-ink-900">
          Service<span className="text-gradient">Setu</span>
        </span>
      )}
    </Link>
  );
}
