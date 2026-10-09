import { useMutation } from '@tanstack/react-query';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Card, CardTitle, Field, Input, PageHeader, useToast, errorMessage } from '../../components/ui';
import { put } from '../../lib/api';
import { useAuth, useSession } from '../../lib/auth';
import type { School } from '../../lib/types';

export default function SchoolProfilePage() {
  const { school } = useSession();
  const { refresh } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<School>(school);
  const [logoChanged, setLogoChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof School>(k: K, v: School[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const { id: _id, logo, ...rest } = f;
      void _id;
      return put('/school', { ...rest, ...(logoChanged ? { logo } : {}) });
    },
    onSuccess: async () => {
      await refresh();
      setLogoChanged(false);
      setError(null);
      toast.ok('School profile saved.');
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError('The logo must be a PNG or JPEG picture.');
    if (file.size > 450_000) return setError('The logo is too big. Use a picture under 450 KB.');
    const reader = new FileReader();
    reader.onload = () => {
      set('logo', String(reader.result));
      setLogoChanged(true);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  const text = (label: string, k: keyof School, hint?: string, className?: string): ReactNode => (
    <Field label={label} hint={hint} className={className}>
      {(id) => <Input id={id} value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value as never)} />}
    </Field>
  );
  const numberField = (label: string, k: 'passingGrade' | 'honorsWith' | 'honorsHigh' | 'honorsHighest' | 'honorsMinSubject', hint?: string): ReactNode => (
    <Field label={label} hint={hint}>
      {(id) => <Input id={id} inputMode="numeric" value={f[k]} onChange={(e) => set(k, Number(e.target.value.replace(/\D/g, '')) as never)} />}
    </Field>
  );

  return (
    <>
      <PageHeader title="School profile" sub="Printed on report cards and permanent records." actions={<Button variant="primary" loading={save.isPending} icon={<Save className="size-4" />} onClick={() => save.mutate()}>Save changes</Button>} />
      {error ? <div className="mb-3"><Alert tone="bad">{error}</Alert></div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>School</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {text('School name', 'name', undefined, 'sm:col-span-2')}
            {text('DepEd school ID', 'schoolId', '6 digits, from the DepEd school directory')}
            {text('Region', 'region')}
            {text('Division', 'division')}
            {text('District', 'district')}
            {text('Address', 'address', undefined, 'sm:col-span-2')}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Signatories</CardTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {text('School head', 'principalName')}
              {text('Title', 'principalTitle', 'For example Principal IV')}
              {text('Registrar', 'registrarName')}
            </div>
          </Card>
          <Card>
            <CardTitle sub="PNG or JPEG under 450 KB">School logo</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2">
                {f.logo ? <img src={f.logo} alt="School logo" className="size-full object-contain" /> : <ImagePlus className="size-6 text-muted" aria-hidden />}
              </div>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
                <Button onClick={() => fileRef.current?.click()}>Choose picture</Button>
                {f.logo ? <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => { set('logo', null); setLogoChanged(true); }}>Remove</Button> : null}
              </div>
            </div>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardTitle sub="DepEd Order No. 8, s. 2015 sets the passing grade at 75. Change these only if the division tells you to.">Grading policy</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {numberField('Passing grade', 'passingGrade')}
            {numberField('With Honors from', 'honorsWith', 'general average')}
            {numberField('With High Honors from', 'honorsHigh')}
            {numberField('With Highest Honors from', 'honorsHighest')}
            {numberField('No subject below', 'honorsMinSubject', 'to receive honors')}
          </div>
          <p className="mt-3 text-xs text-muted">Component weights (Written Work, Performance Tasks, Term Assessment) are under Curriculum, Weights.</p>
        </Card>
      </div>
    </>
  );
}
