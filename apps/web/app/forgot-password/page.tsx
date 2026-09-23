'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthCard, FormError } from '@/components/auth-card';
import { AuthClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({ email: z.string().email('Enter a valid email address') });

type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage(): React.JSX.Element {
  const client = React.useMemo(() => new AuthClient(), []);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await client.post('/auth/forgot-password', values);
      // The API answers the same way whether or not the email is registered,
      // and so does this screen.
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the email');
    }
  });

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        description="If that address has an account, a reset link is on its way. The link is good for one hour."
        footer={
          <Link className="underline" href="/login">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Nothing arrived? Check the spam folder, then try again.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="We will email you a link."
      footer={
        <Link className="underline" href="/login">
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          <FieldError error={form.formState.errors.email} />
        </div>

        <FormError message={error} />

        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  );
}
