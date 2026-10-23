import { useState } from 'react';
import { Feather, Home, Mail, MessagesSquare, MoreHorizontal, Search, Settings, ShieldCheck, User, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRealtime } from '../hooks/useRealtime';

/** Barre de navigation basse (mobile, < 768px). Remplace la colonne de gauche, masquée. */
export default function MobileNav() {
  const { user } = useAuth();
  const { unreadMessages } = useRealtime();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user || /^\/messages\/\d+/.test(pathname) || pathname === '/chat') return null;

  const itemsLeft = [
    { to: '/', icon: Home, label: 'Accueil', badge: 0 },
    { to: '/explore', icon: Search, label: 'Explorer', badge: 0 },
  ];

  const itemsRight = [
    { to: '/messages', icon: Mail, label: 'Messages', badge: unreadMessages },
    { to: `/${user.pseudo}`, icon: User, label: 'Profil', badge: 0 },
  ];

  const moreItems = [
    { to: '/chat', icon: MessagesSquare, label: 'Salon', badge: 0 },
    { to: '/settings', icon: Settings, label: 'Réglages', badge: 0 },
    ...(user.role === 'moderator' || user.role === 'admin'
      ? [{ to: '/admin', icon: ShieldCheck, label: 'Modération', badge: 0 }]
      : []),
  ];

  return (
    <>
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[55] bg-black/30"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}
      {moreOpen && (
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl bg-[var(--bg-secondary)] border-t border-[var(--border-color)] pb-[env(safe-area-inset-bottom)]"
          role="menu"
          aria-label="Autres destinations"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Menu</span>
            <button
              onClick={() => setMoreOpen(false)}
              className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex flex-col px-2 py-2">
            {moreItems.map(({ to, icon: Icon, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors hover:no-underline ${
                    isActive
                      ? 'text-[var(--accent)] font-semibold bg-[var(--bg-tertiary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent)] text-white text-[11px] font-bold flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
      <nav
        aria-label="Navigation principale"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t border-[var(--border-color)] bg-[var(--bg-secondary)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        {itemsLeft.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-[10px] transition-colors hover:no-underline ${
                isActive
                  ? 'text-[var(--accent)] font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-compose'))}
          aria-label="Nouveau post"
          className="flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5"
        >
          <span className="w-10 h-10 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center shadow-md -mt-3">
            <Feather className="w-5 h-5" />
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">Publier</span>
        </button>
        {itemsRight.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-[10px] transition-colors hover:no-underline ${
                isActive
                  ? 'text-[var(--accent)] font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Plus d'options"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal className="w-6 h-6" />
          <span>Plus</span>
        </button>
      </nav>
    </>
  );
}
