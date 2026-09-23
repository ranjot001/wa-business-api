'use client';

import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Minimal home for a signed in user. Task 05 replaces this with the inbox; for
 * now it proves the session, the workspace header and the role are all real.
 */
export default function DashboardPage(): React.JSX.Element {
  const { user, activeWorkspace } = useAuth();

  return (
    <AppShell>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{activeWorkspace?.name ?? 'No workspace'}</CardTitle>
          <CardDescription>
            Signed in as {user?.name ?? 'unknown'}. The inbox arrives in a later task.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Workspace id: </span>
            <span className="font-mono text-xs">{activeWorkspace?.id ?? 'none'}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Your role: </span>
            {activeWorkspace?.role ?? 'none'}
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
