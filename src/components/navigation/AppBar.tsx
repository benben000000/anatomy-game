import { NavLink } from 'react-router-dom';
import { APP_CONFIG } from '@/config/app-config';
import { Icon, type IconName } from '@/components/shared/Icon';

export interface NavigationItem {
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
}

/** Compact, stable navigation. No dashboard, no badge clutter. */
export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { to: '/', label: 'Home', icon: 'info' },
  { to: '/explore', label: 'Explore', icon: 'book' },
  { to: '/practice', label: 'Practice', icon: 'hint' },
  { to: '/identify', label: 'Identify', icon: 'check' },
  { to: '/progress', label: 'Progress', icon: 'reset' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function PrimaryNav() {
  return (
    <nav className="primary-nav" aria-label="Main">
      {NAVIGATION_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className="primary-nav__link">
          <Icon name={item.icon} size={18} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppBar() {
  return (
    <header className="app-bar" role="banner">
      <div className="app-bar__brand">
        <span className="app-bar__title">{APP_CONFIG.name}</span>
        <span className="app-bar__tagline">{APP_CONFIG.tagline}</span>
      </div>
      <div className="app-bar__spacer" />
      <div className="app-bar__actions">
        <PrimaryNav />
      </div>
    </header>
  );
}
