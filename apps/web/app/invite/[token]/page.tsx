'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthCard, FormError } from '@/components/auth-card';
import { useAuth } from '@/components/auth-provider';
import { AuthClient, ACTIVE_WORKSPACE_KEY, type SessionUser } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Name and password are optional on the API too: they are only needed when the
 * invited address has no account yet. Someone who already has one accepts by
 * leaving both blank.
 */
const schema = z.object({
  name: z.string().optional(),
  password: z.string().optional(),
});

type Values = z.infer<typeof schema>;

interface AcceptResponse {
  user: SessionUser;
  access_token: string;
  workspace: { id: string; name: string; slug: string };
}

export default function AcceptInvitePage(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { reload } = useAuth();
  const client = React.useMemo(() => new AuthClient(), []);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await client.post<AcceptResponse>('/invitations/accept', {
        token: params.token,
        ...(values.name ? { name: values.name } : {}),
        ...(values.password ? { password: values.password } : {}),
      });

      // Accepting signs the invitee in, so land them in the workspace they
      // were invited to rather than back at the login screen.
      window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, result.workspace.id);
      await reload().catch(() => undefined);
      router.push('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept the invitation');
    }
  });

  return (
    <AuthCard
      title="Accept your invitation"
      description="If you already have an account, leave these blank and just accept."
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" {...form.register('name')} />
          <FieldError error={form.formState.errors.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
          <FieldError error={form.formState.errors.password} />
        </div>

        <FormError message={error} />

        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Joining...' : 'Accept invitation'}
        </Button>
      </form>
    </AuthCard>
  );
}
