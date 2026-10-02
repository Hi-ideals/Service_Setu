import { Outlet } from 'react-router-dom';
import { Home, Search, CalendarCheck, User, Star, FileText } from 'lucide-react';
import AppHeader from './AppHeader.jsx';
import AppFooter from './AppFooter.jsx';
import BottomNav from './BottomNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/account', label: 'Account', icon: User },
];

const MENU = [
  { to: '/account', label: 'My account', icon: User },
  { to: '/bookings', label: 'My bookings', icon: CalendarCheck },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/reviews', label: 'My reviews', icon: Star },
];

export default function CustomerLayout() {
  const { isAuthenticated } = useAuth();
  const navItems = isAuthenticated ? NAV : NAV.filter((n) => n.to !== '/bookings' && n.to !== '/account');

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">Skip to content</a>

      <AppHeader
        navItems={[
          { to: '/', label: 'Home', end: true },
          { to: '/search', label: 'Find a professional' },
          ...(isAuthenticated ? [{ to: '/bookings', label: 'My bookings' }] : []),
        ]}
        menuLinks={MENU}
      />

      {/* The bottom padding clears the phone navigation bar. */}
      <main id="main" className="page-enter flex-1 pb-safe-bottom md:pb-0">
        <Outlet />
      </main>

      <AppFooter />

      {isAuthenticated && <BottomNav items={navItems} />}
    </div>
  );
}
