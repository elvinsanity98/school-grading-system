import type { Role } from '@bnhs/core';
import { App as CapApp } from '@capacitor/app';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router';
import { Alert, Button, Spinner, errorMessage } from './components/ui';
import { AppShell } from './layout/AppShell';
import { needsServerSetup } from './lib/api';
import { useAuth, useSession } from './lib/auth';
import { isNative } from './lib/platform';
import { AccountPage, ForcePasswordChange } from './pages/Account';
import { FirstRun } from './pages/FirstRun';
import { Login, ServerConnect, useSetupStatus } from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Classes = lazy(() => import('./pages/Classes'));
const ClassRecord = lazy(() => import('./pages/ClassRecord'));
const Advisory = lazy(() => import('./pages/Advisory'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Learners = lazy(() => import('./pages/Learners'));
const LearnerDetail = lazy(() => import('./pages/LearnerDetail'));
const Sections = lazy(() => import('./pages/Sections'));
const SectionDetail = lazy(() => import('./pages/Sections').then((m) => ({ default: m.SectionDetailPage })));
const Reports = lazy(() => import('./pages/Reports'));
const MyGrades = lazy(() => import('./pages/MyGrades'));
const SchoolProfile = lazy(() => import('./pages/setup/SchoolProfile'));
const Years = lazy(() => import('./pages/setup/Years'));
const Users = lazy(() => import('./pages/setup/Users'));
const Curriculum = lazy(() => import('./pages/setup/Curriculum'));
const Audit = lazy(() => import('./pages/setup/SystemPages').then((m) => ({ default: m.AuditPage })));
const System = lazy(() => import('./pages/setup/SystemPages').then((m) => ({ default: m.SystemPage })));

function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useSession();
  return roles.includes(user.role) ? <>{children}</> : <Navigate to="/" replace />;
}

const OFFICE: Role[] = ['ADMIN', 'REGISTRAR'];
const STAFF: Role[] = ['ADMIN', 'REGISTRAR', 'TEACHER'];
const FAMILY: Role[] = ['STUDENT', 'PARENT'];

function Fallback() {
  return <Spinner />;
}

function AndroidBack() {
  useEffect(() => {
    if (!isNative()) return;
    const handle = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void CapApp.exitApp();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);
  return null;
}

function Routed() {
  const Router = isNative() ? HashRouter : BrowserRouter;
  return (
    <Router>
      <AndroidBack />
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="account" element={<AccountPage />} />

            <Route path="my-grades" element={<RoleGate roles={FAMILY}><MyGrades /></RoleGate>} />

            <Route path="classes" element={<RoleGate roles={STAFF}><Classes /></RoleGate>} />
            <Route path="classes/:id" element={<RoleGate roles={STAFF}><ClassRecord /></RoleGate>} />
            <Route path="advisory/:id" element={<RoleGate roles={STAFF}><Advisory /></RoleGate>} />

            <Route path="approvals" element={<RoleGate roles={OFFICE}><Approvals /></RoleGate>} />
            <Route path="learners" element={<RoleGate roles={OFFICE}><Learners /></RoleGate>} />
            <Route path="learners/:id" element={<RoleGate roles={OFFICE}><LearnerDetail /></RoleGate>} />
            <Route path="sections" element={<RoleGate roles={OFFICE}><Sections /></RoleGate>} />
            <Route path="sections/:id" element={<RoleGate roles={OFFICE}><SectionDetail /></RoleGate>} />
            <Route path="reports" element={<RoleGate roles={OFFICE}><Reports /></RoleGate>} />

            <Route path="setup/years" element={<RoleGate roles={OFFICE}><Years /></RoleGate>} />
            <Route path="setup/school" element={<RoleGate roles={['ADMIN']}><SchoolProfile /></RoleGate>} />
            <Route path="setup/users" element={<RoleGate roles={['ADMIN']}><Users /></RoleGate>} />
            <Route path="setup/curriculum" element={<RoleGate roles={['ADMIN']}><Curriculum /></RoleGate>} />
            <Route path="setup/audit" element={<RoleGate roles={['ADMIN']}><Audit /></RoleGate>} />
            <Route path="setup/system" element={<RoleGate roles={['ADMIN']}><System /></RoleGate>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

function FullPage({ children }: { children: ReactNode }) {
  return <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-10">{children}</div>;
}

/** Decides what to show before the signed-in app: connect, first-run setup, sign-in or the app itself. */
export default function App() {
  const auth = useAuth();
  const status = useSetupStatus();

  if (needsServerSetup()) {
    return (
      <FullPage>
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-12 rounded-xl" />
          <h1 className="text-xl font-semibold">BNHS SHS Grades</h1>
        </div>
        <ServerConnect onDone={() => window.location.reload()} />
      </FullPage>
    );
  }

  if (auth.loading) return <Spinner label="Signing in" />;

  if (!auth.signedIn) {
    if (status.isPending) return <Spinner />;
    if (status.isError) {
      return (
        <FullPage>
          <Alert tone="bad" title="Cannot reach the school server">{errorMessage(status.error)}</Alert>
          <Button onClick={() => void status.refetch()}>Try again</Button>
          {isNative() ? <ServerConnect onDone={() => window.location.reload()} /> : null}
        </FullPage>
      );
    }
    if (status.data.needsSetup) return <FirstRun schoolName={status.data.schoolName} />;
    return <Login schoolName={status.data.schoolName} demo={status.data.demo} />;
  }

  if (auth.user?.mustChangePassword) return <ForcePasswordChange />;
  return <Routed />;
}
