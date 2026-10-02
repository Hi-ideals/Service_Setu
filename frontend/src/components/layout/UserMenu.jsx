import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, User } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../ui/Button.jsx';
import Avatar from '../ui/Avatar.jsx';

export default function UserMenu({ links = [] }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button as={Link} to="/signin" variant="ghost" size="sm">
          Sign in
        </Button>
        <Button as={Link} to="/register" size="sm">
          Get started
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx(
          'flex items-center gap-2 rounded-pill p-1 pr-2 transition-[background-color,box-shadow] duration-200',
          'hover:bg-ink-100 hover:shadow-xs',
          open && 'bg-ink-100 shadow-xs',
        )}
      >
        <Avatar src={user.avatarUrl} name={user.fullName} size="sm" />
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-ink-700 sm:block">
          {user.fullName}
        </span>
        <ChevronDown aria-hidden="true" className={clsx('h-4 w-4 text-ink-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 origin-top-right animate-scale-in overflow-hidden
                     rounded-card bg-white py-1 shadow-pop ring-1 ring-ink-200/80"
        >
          <div className="flex items-center gap-2.5 border-b border-ink-200/80 bg-gradient-to-b from-ink-50/80 to-white px-3 py-3">
            <Avatar src={user.avatarUrl} name={user.fullName} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{user.fullName}</p>
              <p className="truncate text-xs text-ink-500">{user.email || user.phone}</p>
            </div>
          </div>

          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="group flex items-center gap-2.5 px-3 py-2 text-base text-ink-700 transition-colors hover:bg-brand-50/60 hover:text-brand-700"
            >
              {link.icon && (
                <link.icon
                  aria-hidden="true"
                  className="h-4 w-4 text-ink-400 transition-colors group-hover:text-brand-600"
                />
              )}
              {link.label}
            </Link>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/');
            }}
            className="mt-1 flex w-full items-center gap-2.5 border-t border-ink-200/80 px-3 py-2.5 text-base font-medium text-danger-600 transition-colors hover:bg-danger-50"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export { User };
