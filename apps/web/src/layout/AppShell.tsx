import type { Role } from '@bnhs/core';
import { ROLE_LABEL } from '@bnhs/core';
import {
  BookOpenCheck,
  ClipboardCheck,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  Moon,
  Settings2,
  Sun,
  UserCog,
  Users,
  WifiOff,
  X,
  CalendarRange,
  School,
  Layers,
  Database,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { DemoBar } from '../components/demo';
import { cx } from '../components/ui';
import { useAuth, useSession } from '../lib/auth';
import { useSetupStatus } from '../pages/Login';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}
interface NavGroup {
  title?: string;
  items: NavItem[];
}

function navFor(role: Role, advisory: Array<{ id: number; name: string; gradeLevel: number }>): { groups: NavGroup[]; primary: string[] } {
  const home: NavItem = { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true };
  if (role === 'STUDENT' || role === 'PARENT') {
    return { groups: [{ items: [{ to: '/my-grades', label: 'My grades', icon: GraduationCap }] }], primary: ['/my-grades'] };
  }
  if (role === 'TEACHER') {
    const items: NavItem[] = [home, { to: '/classes', label: 'My classes', icon: BookOpenCheck }];
    for (const s of advisory) items.push({ to: `/advisory/${s.id}`, label: `Advisory ${s.gradeLevel}-${s.name}`, icon: Users });
    return { groups: [{ items }], primary: items.slice(0, 4).map((i) => i.to) };
  }
  const main: NavItem[] = [
    home,
    { to: '/approvals', label: 'Approvals', icon: ClipboardCheck },
    { to: '/classes', label: 'Classes', icon: BookOpenCheck },
    { to: '/sections', label: 'Sections', icon: Layers },
    { to: '/learners', label: 'Learners', icon: GraduationCap },
    { to: '/reports', label: 'Reports', icon: FileText },
  ];
  if (advisory.length) for (const s of advisory) main.push({ to: `/advisory/${s.id}`, label: `Advisory ${s.gradeLevel}-${s.name}`, icon: Users });
  const setup: NavItem[] = [{ to: '/setup/years', label: 'School years', icon: CalendarRange }];
  if (role === 'ADMIN') {
    setup.unshift({ to: '/setup/school', label: 'School profile', icon: School });
    setup.push(
      { to: '/setup/curriculum', label: 'Curriculum', icon: LibraryBig },
      { to: '/setup/users', label: 'Users', icon: UserCog },
      { to: '/setup/audit', label: 'Audit log', icon: History },
      { to: '/setup/system', label: 'System & backup', icon: Database },
    );
  }
  return { groups: [{ items: main }, { title: 'Setup', items: setup }], primary: ['/', '/approvals', '/classes', '/learners'] };
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('bnhs.theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    setDark(next);
  };
  return { dark, toggle };
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function Brand({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="size-9 rounded-lg" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold">{name}</p>
        <p className="text-[11px] text-muted">SHS Grading System</p>
      </div>
    </div>
  );
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-4">
      {groups.map((g, i) => (
        <div key={g.title ?? i}>
          {g.title ? <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">{g.title}</p> : null}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  end={it.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx('flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors', isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink')
                  }
                >
                  <it.icon className="size-[18px] shrink-0" aria-hidden />
                  <span className="truncate">{it.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserBlock({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useSession();
  const { signOut } = useAuth();
  const { dark, toggle } = useTheme();
  return (
    <div className="border-t border-line pt-3">
      <NavLink to="/account" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <UserRound className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium">{user.fullName}</span>
          <span className="block text-xs text-muted">{ROLE_LABEL[user.role]}</span>
        </span>
      </NavLink>
      <div className="mt-1 flex gap-1 px-1">
        <button onClick={toggle} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-[13px] text-muted hover:bg-surface-2 hover:text-ink">
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {dark ? 'Light' : 'Dark'}
        </button>
        <button onClick={signOut} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-[13px] text-muted hover:bg-surface-2 hover:text-ink">
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AppShell(): ReactNode {
  const { school, user, advisory } = useSession();
  const { groups, primary } = navFor(user.role, advisory);
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const online = useOnline();
  const demo = useSetupStatus().data?.demo ?? null;
  useEffect(() => setDrawer(false), [location.pathname]);

  const flat = groups.flatMap((g) => g.items);
  const bottom = primary.map((p) => flat.find((i) => i.to === p)).filter((i): i is NavItem => Boolean(i));

  return (
    <div className="flex min-h-dvh">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-4 lg:flex">
        <Brand name={school.name} />
        <div className="flex-1">
          <NavList groups={groups} />
        </div>
        <UserBlock />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {demo ? <DemoBar demo={demo} username={user.username} /> : null}
        {/* mobile top bar */}
        <header className="safe-top sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur lg:hidden">
          <button aria-label="Open menu" onClick={() => setDrawer(true)} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2">
            <Menu className="size-5" />
          </button>
          <Brand name={school.name} />
        </header>

        {!online ? (
          <div role="status" className="flex items-center justify-center gap-2 bg-warn-soft px-3 py-2 text-sm text-warn">
            <WifiOff className="size-4" aria-hidden /> You are offline. Changes cannot be saved until the connection is back.
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pt-4 pb-24 sm:px-6 lg:pb-8">
          <Outlet />
        </main>

        {/* mobile bottom navigation */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface lg:hidden" aria-label="Main">
          {bottom.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) => cx('flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-brand' : 'text-muted')}
            >
              <it.icon className="size-5" aria-hidden />
              <span className="max-w-full truncate px-1">{it.label.replace(/^Advisory /, '')}</span>
            </NavLink>
          ))}
          <button onClick={() => setDrawer(true)} className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
            <Settings2 className="size-5" aria-hidden />
            More
          </button>
        </nav>
      </div>

      {/* mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="safe-top safe-bottom absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand name={school.name} />
              <button aria-label="Close menu" onClick={() => setDrawer(false)} className="flex size-9 items-center justify-center rounded-lg hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1">
              <NavList groups={groups} onNavigate={() => setDrawer(false)} />
            </div>
            <UserBlock onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
