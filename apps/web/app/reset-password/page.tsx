'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthCard, FormError } from '@/components/auth-card';
import { AuthClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({ password: z.string().min(8, 'Use at least 8 characters') });

type Values = z.infer<typeof schema>;

function ResetPasswordForm(): React.JSX.Element {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const client = React.useMemo(() => new AuthClient(), []);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await client.post('/auth/reset-password', { token, password: values.password });
      router.push('/login');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset the password');
    }
  });

  if (!token) {
    return (
      <AuthCard
        title="Link is incomplete"
        description="This reset link is missing its token. Ask for a new one."
        footer={
          <Link className="underline" href="/forgot-password">
            Send another link
          </Link>
        }
      >
        <span />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" description="Signing you out everywhere else.">
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
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
          {form.formState.isSubmitting ? 'Saving...' : 'Save password'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage(): React.JSX.Element {
  // useSearchParams needs a Suspense boundary to keep the route from opting
  // the whole page into client side rendering at build time.
  return (
    <React.Suspense fallback={<main className="p-6 text-sm">Loading...</main>}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}
