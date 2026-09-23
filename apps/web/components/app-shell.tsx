'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';
import { WorkspaceSwitcher } from './workspace-switcher';
import { Button } from './ui/button';

/**
 * Frame for every signed in page: a header with the workspace switcher and
 * sign out, and a guard that sends signed out visitors to /login.
 */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const { user, workspaces, signOut } = useAuth();

  React.useEffect(() => {
    if (user === null) {
      router.push('/login');
      return;
    }

    // Signed in but belonging to nowhere: finish onboarding first.
    if (user && workspaces.length === 0) {
      router.push('/onboarding');
    }
  }, [user, workspaces, router]);

  if (user === undefined) {
    return <main className="p-6 text-sm text-muted-foreground">Loading...</main>;
  }

  if (!user) {
    return <main className="p-6 text-sm text-muted-foreground">Redirecting to sign in...</main>;
  }

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">WhatsApp CRM</span>
          <WorkspaceSwitcher />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
