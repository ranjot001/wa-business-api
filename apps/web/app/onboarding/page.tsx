'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthCard, FormError } from '@/components/auth-card';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  name: z.string().min(1, 'Give the workspace a name'),
  timezone: z.string().min(1, 'Pick a timezone'),
});

type Values = z.infer<typeof schema>;

/** Step 1 of onboarding: create the first workspace. */
export default function OnboardingPage(): React.JSX.Element {
  const router = useRouter();
  const { user, request, reload, setActiveWorkspace } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      // A sensible default beats an empty box; the user can still change it.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
  });

  React.useEffect(() => {
    if (user === null) {
      router.push('/login');
    }
  }, [user, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const workspace = await request<{ id: string }>('/workspaces', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      await reload();
      setActiveWorkspace(workspace.id);
      router.push('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the workspace');
    }
  });

  return (
    <AuthCard title="Create your workspace" description="Step 1 of onboarding.">
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Workspace name</Label>
          <Input id="name" placeholder="Acme Support" {...form.register('name')} />
          <FieldError error={form.formState.errors.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" {...form.register('timezone')} />
          <FieldError error={form.formState.errors.timezone} />
        </div>

        <FormError message={error} />

        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating...' : 'Create workspace'}
        </Button>
      </form>
    </AuthCard>
  );
}
