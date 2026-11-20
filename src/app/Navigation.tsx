/**
 * Navigazione principale.
 * - Smartphone: barra inferiore flottante con 5 voci (Home, Esplora, Allenamento al centro, Nutrizione, Profilo).
 * - Desktop: sidebar con tutte le sezioni, le loro funzioni e un accesso rapido all'allenamento.
 */
import type { CSSProperties } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, Dumbbell, Apple, User, Play, Timer, Settings } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { SyncBadge } from '@/components/sync-badge';
import { EXPLORE_ORDER, SECTIONS, routeMeta, tabFor } from '@/design/sections';
import { useSessions } from './data';

function useActiveSession() {
  return useSessions().find((s) => s.status === 'active');
}

export function BottomNav() {
  const { pathname } = useLocation();
  const tab = tabFor(pathname);
  const active = useActiveSession();
  const items = [
    { k: 'home', to: '/', label: 'Home', icon: Home },
    { k: 'explore', to: '/explore', label: 'Esplora', icon: Compass },
    { k: 'training', to: active ? '/workout/live' : '/workouts', label: active ? 'In corso' : 'Allenamento', icon: Dumbbell },
    { k: 'nutrition', to: '/nutrition', label: 'Nutrizione', icon: Apple },
    { k: 'profile', to: '/profile', label: 'Profilo', icon: User },
  ] as const;
  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      {items.map((n) => n.k === 'training' ? (
        <Link key={n.k} to={n.to} className={`nav-item center ${tab === n.k ? 'active' : ''}`} aria-current={tab === n.k ? 'page' : undefined} aria-label={active ? 'Allenamento in corso' : 'Allenamento'}>
          <span className="nav-fab" aria-hidden>{active ? <Timer size={23} /> : <Dumbbell size={23} />}</span>
          {active && <i className="nav-live" aria-hidden />}
          <span>{n.label}</span>
        </Link>
      ) : (
        <Link key={n.k} to={n.to} className={`nav-item ${tab === n.k ? 'active' : ''}`} aria-current={tab === n.k ? 'page' : undefined}>
          <n.icon size={22} /> <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function SideNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const current = routeMeta(loc.pathname).section;
  const active = useActiveSession();
  const here = loc.pathname + loc.search;
  return (
    <nav className="side-nav" aria-label="Navigazione principale">
      <Link to="/" className="brand"><BrandMark /> Forma</Link>
      <button className={`btn ${active ? 'primary' : 'soft'} side-cta`} onClick={() => nav(active ? '/workout/live' : '/workouts')}>
        {active ? <><Timer size={17} /> Riprendi allenamento</> : <><Play size={17} fill="currentColor" /> Allenati ora</>}
      </button>
      <NavLink to="/" end className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}><span className="si-ic"><Home size={17} /></span> Home</NavLink>
      <NavLink to="/explore" className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}><span className="si-ic"><Compass size={17} /></span> Esplora</NavLink>
      <div className="side-label">Sezioni</div>
      {EXPLORE_ORDER.map((k) => {
        const s = SECTIONS[k];
        const on = current === k;
        return (
          <div key={k}>
            <Link to={s.to} className={`side-item ${on ? 'active' : ''}`} style={{ ['--sc' as string]: s.color } as CSSProperties} aria-current={on ? 'page' : undefined}>
              <span className="si-ic"><s.icon size={17} /></span> {k === 'coach' ? 'Coach AI' : s.label}
            </Link>
            {on && s.links.length > 1 && (
              <div className="side-sub">
                {s.links.filter((l) => l.to !== '/workout/live' || active).map((l) => <Link key={l.label} to={l.to} className={here === l.to ? 'active' : ''}>{l.label}</Link>)}
              </div>
            )}
          </div>
        );
      })}
      <div className="side-foot">
        <NavLink to="/profile" className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}><span className="si-ic"><User size={17} /></span> Profilo</NavLink>
        <NavLink to="/settings" className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}><span className="si-ic"><Settings size={17} /></span> Impostazioni</NavLink>
        <div style={{ padding: '10px 12px 0' }}><SyncBadge /></div>
      </div>
    </nav>
  );
}
