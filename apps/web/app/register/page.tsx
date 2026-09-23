'use client';

import * as React from 'react';
import Link from 'next/link';
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
  name: z.string().min(1, 'Enter your name'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

type Values = z.infer<typeof schema>;

export default function RegisterPage(): React.JSX.Element {
  const router = useRouter();
  const { signIn } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await signIn('/auth/register', values);
      // A brand new account belongs to no workspace yet, so it goes straight
      // to onboarding rather than an empty dashboard.
      router.push('/onboarding');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the account');
    }
  });

  return (
    <AuthCard
      title="Create an account"
      description="Start your 14 day trial."
      footer={
        <Link className="underline" href="/login">
          I already have an account
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" {...form.register('name')} />
          <FieldError error={form.formState.errors.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          <FieldError error={form.formState.errors.email} />
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
          {form.formState.isSubmitting ? 'Creating...' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
