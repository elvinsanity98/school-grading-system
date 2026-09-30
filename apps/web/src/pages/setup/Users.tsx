import { ROLES, ROLE_LABEL, type Role } from '@bnhs/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, Empty, Field, Input, Modal, PageHeader, Select, Spinner, TableWrap, errorMessage, tableCls, tdCls, thCls, useToast } from '../../components/ui';
import { get, post, put, qs } from '../../lib/api';
import { useSession } from '../../lib/auth';
import { dateTimeLabel } from '../../lib/format';
import type { User } from '../../lib/types';

const STAFF_ROLES: Role[] = ['ADMIN', 'REGISTRAR', 'TEACHER'];

export default function UsersPage() {
  const { user: me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState('');
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [shown, setShown] = useState<{ title: string; username: string; password: string } | null>(null);

  const q = useQuery({ queryKey: ['users', role, term], queryFn: () => get<User[]>(`/users${qs({ role, q: term })}`), placeholderData: (p) => p });
  const reset = useMutation({
    mutationFn: (u: User) => post<{ tempPassword: string }>(`/users/${u.id}/reset-password`),
    onSuccess: (r, u) => {
      setResetting(null);
      setShown({ title: 'Password reset', username: u.username, password: r.tempPassword });
    },
    onError: (e) => {
      setResetting(null);
      toast.error(errorMessage(e));
    },
  });
  const toggle = useMutation({
    mutationFn: (u: User) => put(`/users/${u.id}`, { fullName: u.fullName, role: u.role, email: u.email, employeeNo: u.employeeNo, active: !u.active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Users" sub="Administrators, registrars and teachers. Learner accounts are made from the Learners page." actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add user</Button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted" aria-hidden />
          <Input aria-label="Search users" className="pl-9" placeholder="Search name or username" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <Select aria-label="Role" className="w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </div>

      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="bad">{errorMessage(q.error)}</Alert> : q.data.length === 0 ? (
        <Card><Empty title="No users found" /></Card>
      ) : (
        <TableWrap>
          <table className={tableCls}>
            <thead>
              <tr><th className={thCls}>Name</th><th className={thCls}>Username</th><th className={thCls}>Role</th><th className={thCls}>Last sign-in</th><th className={thCls}>Status</th><th className={thCls} /></tr>
            </thead>
            <tbody>
              {q.data.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                  <td className={tdCls + ' font-medium'}>{u.fullName}{u.employeeNo ? <span className="ml-2 text-xs font-normal text-muted">{u.employeeNo}</span> : null}</td>
                  <td className={tdCls + ' font-mono text-[13px]'}>{u.username}</td>
                  <td className={tdCls}><Badge tone={u.role === 'ADMIN' ? 'brand' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge></td>
                  <td className={tdCls + ' text-muted'}>{dateTimeLabel(u.lastLoginAt) || 'never'}</td>
                  <td className={tdCls}>{u.active ? (u.mustChangePassword ? <Badge tone="warn">Password not set</Badge> : <Badge tone="ok">Active</Badge>) : <Badge>Disabled</Badge>}</td>
                  <td className={tdCls + ' text-right'}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${u.fullName}`} icon={<Pencil className="size-4" />} onClick={() => setEditing(u)} />
                      <Button size="sm" variant="ghost" aria-label={`Reset password of ${u.fullName}`} icon={<KeyRound className="size-4" />} onClick={() => setResetting(u)} />
                      {u.id !== me.id ? <Button size="sm" variant="ghost" onClick={() => toggle.mutate(u)}>{u.active ? 'Disable' : 'Enable'}</Button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {editing ? <UserModal user={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onCreated={(c) => { setEditing(null); setShown({ title: 'Account created', ...c }); }} /> : null}

      <ConfirmDialog open={resetting != null} title="Reset password?" confirmLabel="Reset" loading={reset.isPending} onConfirm={() => resetting && reset.mutate(resetting)} onClose={() => setResetting(null)}>
        {resetting?.fullName} will be signed out everywhere and must choose a new password with a one-time password you give them.
      </ConfirmDialog>

      <Modal open={shown != null} onClose={() => setShown(null)} title={shown?.title ?? ''} footer={<Button variant="primary" onClick={() => setShown(null)}>Done</Button>}>
        {shown ? (
          <div className="flex flex-col gap-3">
            <Alert tone="warn" title="Write this down now">The one-time password is shown only once. The person must choose a new password at first sign-in.</Alert>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Username</dt><dd className="font-mono font-semibold">{shown.username}</dd>
              <dt className="text-muted">Password</dt><dd className="font-mono font-semibold">{shown.password}</dd>
            </dl>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function UserModal({ user, onClose, onCreated }: { user?: User; onClose: () => void; onCreated: (c: { username: string; password: string }) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ username: user?.username ?? '', fullName: user?.fullName ?? '', role: (user?.role ?? 'TEACHER') as Role, email: user?.email ?? '', employeeNo: user?.employeeNo ?? '', active: user?.active ?? true });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => (user ? put(`/users/${user.id}`, { fullName: f.fullName, role: f.role, email: f.email, employeeNo: f.employeeNo, active: f.active }) : post<{ tempPassword: string; user: User }>('/users', { username: f.username, fullName: f.fullName, role: f.role, email: f.email, employeeNo: f.employeeNo })),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['teachers'] });
      if (user) {
        toast.ok('User updated.');
        onClose();
      } else {
        const c = r as { tempPassword: string; user: User };
        onCreated({ username: c.user.username, password: c.tempPassword });
      }
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const roles = user && (user.role === 'STUDENT' || user.role === 'PARENT') ? ROLES : STAFF_ROLES;
  return (
    <Modal open onClose={onClose} title={user ? 'Edit user' : 'Add user'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!f.fullName.trim() || (!user && f.username.trim().length < 3)} onClick={() => save.mutate()}>{user ? 'Save' : 'Create account'}</Button></>}>
      <div className="flex flex-col gap-3">
        {!user ? <Field label="Username" hint="Letters, numbers, dot, dash. Cannot be changed later.">{(id) => <Input id={id} autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} />}</Field> : <p className="text-sm text-muted">Username: <b className="text-ink">{user.username}</b></p>}
        <Field label="Full name">{(id) => <Input id={id} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />}</Field>
        <Field label="Role">
          {(id) => (
            <Select id={id} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Employee no. (optional)">{(id) => <Input id={id} value={f.employeeNo} onChange={(e) => setF({ ...f, employeeNo: e.target.value })} />}</Field>
          <Field label="Email (optional)">{(id) => <Input id={id} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        </div>
        {!user ? <p className="text-xs text-muted">A one-time password is generated after you create the account.</p> : null}
        {error ? <Alert tone="bad">{error}</Alert> : null}
      </div>
    </Modal>
  );
}
